#!/usr/bin/env python3
"""Rehearse an incremental PocketBase backup in a new APFS target directory."""

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--originals-root", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--verify-all", action="store_true", help="rehash every original before cloning")
    return parser.parse_args()


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(4 * 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def safe_child(root, relative):
    root = root.resolve()
    candidate = root.joinpath(relative).resolve()
    if candidate == root or root not in candidate.parents:
        raise RuntimeError("restore path escapes its root: %s" % candidate)
    return candidate


def validate_snapshot(snapshot, expected_checksum):
    if sha256_file(snapshot) != expected_checksum:
        raise RuntimeError("database snapshot checksum mismatch")
    connection = sqlite3.connect("file:%s?mode=ro&immutable=1" % snapshot.resolve().as_posix(), uri=True)
    try:
        result = connection.execute("PRAGMA quick_check").fetchone()
    finally:
        connection.close()
    if not result or result[0] != "ok":
        raise RuntimeError("database snapshot quick_check failed")


def clone_file(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(["/bin/cp", "-c", "-p", str(source), str(destination)], text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError("APFS clone failed for %s: %s" % (source, result.stderr.strip()))


def main():
    args = parse_args()
    snapshot = args.snapshot.expanduser().resolve()
    manifest_path = args.manifest.expanduser().resolve()
    originals_root = args.originals_root.expanduser().resolve()
    target = args.target.expanduser().resolve()
    if target in (Path("/"), Path.home().resolve()) or target.exists():
        raise RuntimeError("restore target must be a new narrow directory: %s" % target)
    if not snapshot.is_file() or not manifest_path.is_file() or not originals_root.is_dir():
        raise RuntimeError("snapshot, manifest, or originals root is missing")

    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    database = manifest.get("database", {})
    if database.get("file") != snapshot.name or not database.get("sha256"):
        raise RuntimeError("manifest does not match the selected snapshot")
    validate_snapshot(snapshot, database["sha256"])

    target.parent.mkdir(parents=True, exist_ok=True)
    target.mkdir(mode=0o700)
    try:
        shutil.copy2(snapshot, target / "data.db")
        cloned = 0
        checked = 0
        for item in manifest.get("originals", []):
            relative = item.get("relative_path", "")
            source = safe_child(originals_root, relative)
            if not source.is_file() or source.stat().st_size != int(item.get("size", -1)):
                raise RuntimeError("backup original is missing or has wrong size: %s" % relative)
            if args.verify_all:
                if sha256_file(source) != item.get("sha256"):
                    raise RuntimeError("backup original checksum mismatch: %s" % relative)
                checked += 1
            clone_file(source, safe_child(target / "storage", relative))
            cloned += 1
        shutil.copy2(manifest_path, target / "restore-manifest.json")
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise

    print(json.dumps({
        "target": str(target),
        "cloned_originals": cloned,
        "checksum_verified_originals": checked,
        "database_quick_check": "ok",
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("incremental restore failed: %s" % error, file=sys.stderr)
        sys.exit(1)
