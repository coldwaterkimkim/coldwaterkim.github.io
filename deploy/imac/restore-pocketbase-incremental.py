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


DEFAULT_RESERVE_BYTES = 10 * 1024 * 1024 * 1024
REPO_ROOT = Path(__file__).resolve().parents[2]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--originals-root", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--verify-all", action="store_true", help="rehash every original before cloning")
    parser.add_argument("--copy-mode", choices=("auto", "clone", "copy"), default="auto")
    parser.add_argument(
        "--reserve-bytes",
        type=int,
        default=int(os.environ.get("RESTORE_RESERVE_BYTES", str(DEFAULT_RESERVE_BYTES))),
    )
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


def copy_file(source, destination, mode):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if mode != "copy":
        result = subprocess.run(["/bin/cp", "-c", "-p", str(source), str(destination)], text=True, capture_output=True)
        if result.returncode == 0:
            return "clone"
        if mode == "clone":
            raise RuntimeError("APFS clone failed for %s: %s" % (source, result.stderr.strip()))
    shutil.copy2(source, destination)
    return "copy"


def validate_target(target):
    runtime_root = Path(os.environ.get(
        "IMAC_RUNTIME_ROOT",
        Path.home() / ".local/share/coldwaterkim/home-server",
    )).expanduser().resolve()
    protected_data_roots = (
        runtime_root / "pb_data",
        REPO_ROOT / "pb_data",
    )
    if target in (Path("/"), Path.home().resolve(), REPO_ROOT.resolve()) or target.exists():
        raise RuntimeError("restore target must be a new narrow directory: %s" % target)
    for protected in protected_data_roots:
        protected = protected.resolve()
        if target == protected or protected in target.parents:
            raise RuntimeError("refusing canonical PocketBase data target: %s" % target)


def required_restore_bytes(snapshot, manifest):
    total = snapshot.stat().st_size
    for item in manifest.get("originals", []):
        size = int(item.get("size", -1))
        if size < 0:
            raise RuntimeError("manifest original has an invalid size")
        total += size
    return total


def main():
    args = parse_args()
    snapshot = args.snapshot.expanduser().resolve()
    manifest_path = args.manifest.expanduser().resolve()
    originals_root = args.originals_root.expanduser().resolve()
    target = args.target.expanduser().resolve()
    validate_target(target)
    if not snapshot.is_file() or not manifest_path.is_file() or not originals_root.is_dir():
        raise RuntimeError("snapshot, manifest, or originals root is missing")

    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    database = manifest.get("database", {})
    if database.get("file") != snapshot.name or not database.get("sha256"):
        raise RuntimeError("manifest does not match the selected snapshot")
    validate_snapshot(snapshot, database["sha256"])

    target.parent.mkdir(parents=True, exist_ok=True)
    required_bytes = required_restore_bytes(snapshot, manifest)
    free_bytes = shutil.disk_usage(target.parent).free
    if args.reserve_bytes < 0 or free_bytes < required_bytes + args.reserve_bytes:
        raise RuntimeError(
            "insufficient restore space: need %d bytes plus %d reserve, have %d"
            % (required_bytes, args.reserve_bytes, free_bytes)
        )
    target.mkdir(mode=0o700)
    try:
        shutil.copy2(snapshot, target / "data.db")
        if sha256_file(target / "data.db") != database["sha256"]:
            raise RuntimeError("restored database checksum mismatch")
        cloned = 0
        copied = 0
        checked = 0
        destination_checked = 0
        for item in manifest.get("originals", []):
            relative = item.get("relative_path", "")
            source = safe_child(originals_root, relative)
            if not source.is_file() or source.stat().st_size != int(item.get("size", -1)):
                raise RuntimeError("backup original is missing or has wrong size: %s" % relative)
            if args.verify_all:
                if sha256_file(source) != item.get("sha256"):
                    raise RuntimeError("backup original checksum mismatch: %s" % relative)
                checked += 1
            destination = safe_child(target / "storage", relative)
            copy_result = copy_file(source, destination, args.copy_mode)
            if copy_result == "clone":
                cloned += 1
            else:
                copied += 1
            if not item.get("sha256") or sha256_file(destination) != item.get("sha256"):
                raise RuntimeError("restored original checksum mismatch: %s" % relative)
            destination_checked += 1
        shutil.copy2(manifest_path, target / "restore-manifest.json")
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise

    print(json.dumps({
        "target": str(target),
        "cloned_originals": cloned,
        "copied_originals": copied,
        "checksum_verified_originals": checked,
        "destination_verified_originals": destination_checked,
        "database_quick_check": "ok",
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("incremental restore failed: %s" % error, file=sys.stderr)
        sys.exit(1)
