# Kiln idea: A background service

**Roadmap:** [Kiln roadmap](../kiln-roadmap.md).

In v1, `kiln run` runs in the foreground of its terminal, and closing the terminal interrupts Kiln until `kiln run` picks it back up. A background service (launchd, systemd or a Windows service) would keep Kiln going with no terminal open. Worth building only if real use shows that interruptions from closed terminals cost more than the cheap resume makes them.
