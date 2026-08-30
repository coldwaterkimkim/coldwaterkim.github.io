#!/usr/bin/env python3
"""Durably replace a PocketBase runtime file without exposing partial bytes."""

import os
import stat
import sys
from pathlib import Path


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--remove":
        destination = Path(sys.argv[2])
        if destination.is_symlink() or not destination.is_file():
            raise RuntimeError("runtime removal target is not a regular file")
        destination.unlink()
        directory_fd = os.open(destination.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        return
    if len(sys.argv) != 3:
        raise RuntimeError("usage: publish-pocketbase-file.py SOURCE DESTINATION | --remove DESTINATION")
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    if source.parent != destination.parent:
        raise RuntimeError("runtime file replacement must stay in one directory")
    source_stat = source.lstat()
    if not stat.S_ISREG(source_stat.st_mode) or not source_stat.st_mode & stat.S_IXUSR:
        raise RuntimeError("runtime source must be an executable regular file")
    if destination.is_symlink() or (destination.exists() and not destination.is_file()):
        raise RuntimeError("runtime destination must be absent or a regular file")
    source_fd = os.open(source, os.O_RDONLY)
    try:
        os.fsync(source_fd)
    finally:
        os.close(source_fd)
    os.replace(source, destination)
    directory_fd = os.open(source.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("PocketBase runtime file publication failed: %s" % error, file=sys.stderr)
        raise SystemExit(1)
