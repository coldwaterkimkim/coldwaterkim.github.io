#!/usr/bin/env python3
"""Atomically publish a validated PocketBase generation symlink."""

import fcntl
import os
import re
import sys
from pathlib import Path


TARGET_PATTERN = re.compile(r"^generations/[0-9a-f]{40,64}-[0-9a-f]{64}$")


def full_sync(descriptor):
    os.fsync(descriptor)
    if sys.platform == "darwin":
        command = getattr(fcntl, "F_FULLFSYNC", None)
        if command is None:
            raise RuntimeError("F_FULLFSYNC is unavailable on macOS")
        fcntl.fcntl(descriptor, command)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--remove":
        destination = Path(sys.argv[2])
        if not destination.is_symlink():
            raise RuntimeError("release pointer removal target is not a symbolic link")
        if not TARGET_PATTERN.fullmatch(os.readlink(destination)):
            raise RuntimeError("release pointer removal target is invalid")
        destination.unlink()
        directory_fd = os.open(destination.parent, os.O_RDONLY)
        try:
            full_sync(directory_fd)
        finally:
            os.close(directory_fd)
        return
    if len(sys.argv) != 3:
        raise RuntimeError("usage: publish-pocketbase-link.py SOURCE DESTINATION | --remove DESTINATION")
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    if source.parent != destination.parent:
        raise RuntimeError("release symlink replacement must stay in one directory")
    if not source.is_symlink():
        raise RuntimeError("release pointer source is not a symbolic link")
    target = os.readlink(source)
    if not TARGET_PATTERN.fullmatch(target):
        raise RuntimeError("release pointer target is invalid")
    if destination.exists() and not destination.is_symlink():
        raise RuntimeError("release pointer destination is not a symbolic link")
    if destination.is_symlink():
        existing_target = os.readlink(destination)
        if not TARGET_PATTERN.fullmatch(existing_target):
            raise RuntimeError("existing release pointer target is invalid")
    os.replace(source, destination)
    directory_fd = os.open(source.parent, os.O_RDONLY)
    try:
        full_sync(directory_fd)
    finally:
        os.close(directory_fd)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("PocketBase release pointer publication failed: %s" % error, file=sys.stderr)
        raise SystemExit(1)
