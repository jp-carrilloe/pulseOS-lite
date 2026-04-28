#!/usr/bin/env python3
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_window_size(fd: int, rows: int, cols: int) -> None:
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass


def main() -> int:
    shell = os.environ.get("PULSEOS_SHELL") or os.environ.get("SHELL") or "/bin/zsh"
    rows = int(os.environ.get("PULSEOS_TERM_ROWS", "32"))
    cols = int(os.environ.get("PULSEOS_TERM_COLS", "100"))

    pid, fd = pty.fork()
    if pid == 0:
        os.execv(shell, [shell, "-i"])

    set_window_size(fd, rows, cols)

    def _forward_sigwinch(_signum, _frame):
        set_window_size(fd, rows, cols)

    signal.signal(signal.SIGWINCH, _forward_sigwinch)

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()

    while True:
        readable, _, _ = select.select([fd, stdin_fd], [], [], 0.1)
        if fd in readable:
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            os.write(stdout_fd, data)

        if stdin_fd in readable:
            data = os.read(stdin_fd, 4096)
            if not data:
                break
            os.write(fd, data)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
