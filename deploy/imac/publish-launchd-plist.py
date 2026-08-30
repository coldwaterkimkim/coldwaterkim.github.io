#!/usr/bin/env python3
"""Durably publish an allowlisted root-owned coldwaterkim LaunchDaemon plist."""

import fcntl
import os
import stat
import sys
from pathlib import Path


ALLOWED_DESTINATIONS = {
    Path("/Library/LaunchDaemons/com.coldwaterkim.pocketbase.plist"),
    Path("/Library/LaunchDaemons/com.coldwaterkim.pocketbase-backup.plist"),
}


def full_sync(descriptor):
    os.fsync(descriptor)
    if sys.platform == "darwin":
        command = getattr(fcntl, "F_FULLFSYNC", None)
        if command is None:
            raise RuntimeError("F_FULLFSYNC is unavailable on macOS")
        fcntl.fcntl(descriptor, command)


def open_readonly_no_follow(path):
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    return os.open(path, flags)


def main():
    if len(sys.argv) != 3:
        raise RuntimeError("usage: publish-launchd-plist.py SOURCE DESTINATION")
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    if destination not in ALLOWED_DESTINATIONS:
        raise RuntimeError("LaunchDaemon destination is not allowlisted")
    if source.parent != destination.parent or not source.name.startswith(destination.name + ".staged."):
        raise RuntimeError("LaunchDaemon source is not a sibling staged file")
    if source.is_symlink():
        raise RuntimeError("LaunchDaemon source must not be a symbolic link")
    if destination.is_symlink() or (destination.exists() and not destination.is_file()):
        raise RuntimeError("LaunchDaemon destination must be absent or a regular file")

    source_fd = open_readonly_no_follow(source)
    try:
        source_stat = os.fstat(source_fd)
        if not stat.S_ISREG(source_stat.st_mode):
            raise RuntimeError("LaunchDaemon source is not a regular file")
        if source_stat.st_uid != 0 or stat.S_IMODE(source_stat.st_mode) != 0o644:
            raise RuntimeError("LaunchDaemon source must be root-owned mode 0644")
        full_sync(source_fd)
    finally:
        os.close(source_fd)

    os.replace(source, destination)
    directory_fd = open_readonly_no_follow(destination.parent)
    try:
        if not stat.S_ISDIR(os.fstat(directory_fd).st_mode):
            raise RuntimeError("LaunchDaemon parent is not a directory")
        full_sync(directory_fd)
    finally:
        os.close(directory_fd)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("LaunchDaemon plist publication failed: %s" % error, file=sys.stderr)
        raise SystemExit(1)
