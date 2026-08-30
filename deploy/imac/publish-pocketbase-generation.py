#!/usr/bin/env python3
"""Durably publish one complete PocketBase release generation."""

import fcntl
import os
import re
import stat
import sys
from pathlib import Path


GENERATION_PATTERN = re.compile(r"^[0-9a-f]{40,64}-[0-9a-f]{64}$")


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


def sync_regular_file(path):
    descriptor = open_readonly_no_follow(path)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise RuntimeError("generation entry is not a regular file: %s" % path)
        full_sync(descriptor)
    finally:
        os.close(descriptor)


def sync_directory(path):
    descriptor = open_readonly_no_follow(path)
    try:
        if not stat.S_ISDIR(os.fstat(descriptor).st_mode):
            raise RuntimeError("generation entry is not a directory: %s" % path)
        full_sync(descriptor)
    finally:
        os.close(descriptor)


def sync_tree(root):
    for directory, directory_names, file_names in os.walk(root, topdown=False, followlinks=False):
        directory_path = Path(directory)
        for name in directory_names:
            child = directory_path / name
            if child.is_symlink():
                raise RuntimeError("generation must not contain symbolic links: %s" % child)
        for name in file_names:
            child = directory_path / name
            if child.is_symlink():
                raise RuntimeError("generation must not contain symbolic links: %s" % child)
            sync_regular_file(child)
        sync_directory(directory_path)


def main():
    if len(sys.argv) != 3:
        raise RuntimeError("usage: publish-pocketbase-generation.py SOURCE DESTINATION")
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    if source.parent != destination.parent:
        raise RuntimeError("generation publication must stay in one directory")
    if not GENERATION_PATTERN.fullmatch(destination.name):
        raise RuntimeError("generation destination name is invalid")
    if source.is_symlink() or not source.is_dir():
        raise RuntimeError("generation source is not a real directory")
    if destination.exists() or destination.is_symlink():
        raise RuntimeError("generation destination already exists")
    sync_tree(source)
    os.replace(source, destination)
    sync_directory(destination.parent)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("PocketBase generation publication failed: %s" % error, file=sys.stderr)
        raise SystemExit(1)
