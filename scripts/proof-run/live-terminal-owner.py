# Exploration/release proof, not part of the main program. Owns only its disposable
# ordinary Claude terminal and exits it through /exit when the supervisor requests.
import os, pty, sys, select, time, fcntl, termios, struct
folder, session_id, stop_file = sys.argv[1:]
pid, fd = pty.fork()
if pid == 0:
    os.chdir(folder)
    os.environ['TERM'] = 'xterm-256color'
    os.execvp('claude', ['claude', '--resume', session_id])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 36, 140, 0, 0))
print(pid, flush=True)
output = b''
requested = False
started = time.monotonic()
while True:
    readers, _, _ = select.select([fd], [], [], 0.05)
    if readers:
        try:
            chunk = os.read(fd, 65536)
        except OSError:
            chunk = b''
        output += chunk
    if os.path.exists(stop_file) and not requested and time.monotonic() - started > 4:
        os.write(fd, b'/exit\r')
        requested = True
    done, status = os.waitpid(pid, os.WNOHANG)
    if done:
        with open(os.path.join(folder, 'terminal-output.raw'), 'wb') as saved:
            saved.write(output)
        os.close(fd)
        sys.exit(os.waitstatus_to_exitcode(status))
    time.sleep(0.02)
