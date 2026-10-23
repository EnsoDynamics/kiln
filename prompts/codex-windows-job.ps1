# Fixed supervisor, never evidence or user-supplied PowerShell. The launch description is
# JSON data. Start suspended, assign to a non-breakaway Job Object, then permit execution.
# Native Windows execution/argv/MXC proof is a release gate, not established by compilation.
$ErrorActionPreference = 'Stop'
$launch = $env:KILN_CODEX_JOB_LAUNCH | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class KilnCodexJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long ProcessTime, JobTime; public uint Flags;
    public UIntPtr Minimum, Maximum; public uint Active; public UIntPtr Affinity;
    public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A,B,C,D,E,F; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic; public IoCounters Io;
    public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long User,Kernel,PeriodUser,PeriodKernel;
    public uint Faults,Total,Active,Terminated;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
    public uint Size; public string Reserved,Desktop,Title;
    public uint X,Y,XSize,YSize,XCount,YCount,Fill,Flags;
    public ushort Show,Reserved2; public IntPtr ReservedPointer,Input,Output,Error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process,Thread; public uint Pid,Tid; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref ExtendedLimits limits,uint length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int type,out Accounting info,uint length,IntPtr returned);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string application,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref Startup startup,out ProcessInfo info);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Check(bool success) { if(!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static string Quote(string value) {
    // Fixed Codex args need no shell syntax. Refuse paths/argv CMD could expand or reinterpret.
    if(value.IndexOfAny(new char[]{'"','&','|','<','>','^','%','!','\r','\n'})>=0) throw new ArgumentException("Codex executable/argv contains unsupported Windows shell characters; use a plain native CLI path.");
    return "\""+value+"\"";
  }
  public static int Run(string executable,string[] args,string cwd) {
    IntPtr job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    ProcessInfo process=new ProcessInfo(); bool assigned=false;
    try {
      ExtendedLimits limits=new ExtendedLimits(); limits.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE; no BREAKAWAY flags.
      Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits))));
      string application=executable;
      string command=Quote(executable);
      foreach(string arg in args) command+=" "+Quote(arg);
      if(executable.EndsWith(".cmd",StringComparison.OrdinalIgnoreCase)||executable.EndsWith(".bat",StringComparison.OrdinalIgnoreCase)) {
        application=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"cmd.exe");
        command=Quote(application)+" /d /s /c \""+command+"\"";
      }
      Startup startup=new Startup(); startup.Size=(uint)Marshal.SizeOf(typeof(Startup)); startup.Flags=0x100;
      startup.Input=GetStdHandle(-10); startup.Output=GetStdHandle(-11); startup.Error=GetStdHandle(-12);
      Check(SetHandleInformation(startup.Input,1,1)); Check(SetHandleInformation(startup.Output,1,1)); Check(SetHandleInformation(startup.Error,1,1));
      Check(CreateProcess(application,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,4,IntPtr.Zero,cwd,ref startup,out process));
      Check(AssignProcessToJobObject(job,process.Process)); assigned=true;
      if(ResumeThread(process.Thread)==0xffffffff) throw new Win32Exception(Marshal.GetLastWin32Error());
      if(WaitForSingleObject(process.Process,0xffffffff)!=0) throw new Win32Exception(Marshal.GetLastWin32Error());
      uint code; Check(GetExitCodeProcess(process.Process,out code));
      Check(TerminateJobObject(job,1));
      DateTime deadline=DateTime.UtcNow.AddSeconds(5);
      for(;;) { Accounting info; Check(QueryInformationJobObject(job,1,out info,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero)); if(info.Active==0) break; if(DateTime.UtcNow>=deadline) throw new Exception("Codex Job Object cleanup did not settle."); Thread.Sleep(50); }
      return unchecked((int)code);
    } finally {
      if(!assigned&&process.Process!=IntPtr.Zero) TerminateProcess(process.Process,1);
      CloseHandle(job); if(process.Process!=IntPtr.Zero) CloseHandle(process.Process); if(process.Thread!=IntPtr.Zero) CloseHandle(process.Thread);
    }
  }
}
'@
exit [KilnCodexJob]::Run([string]$launch.executable, [string[]]$launch.args, [string]$launch.cwd)
