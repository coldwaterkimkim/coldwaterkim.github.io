#!/usr/bin/env python3
"""Exercise the incremental PocketBase backup against an isolated fixture."""

import json
import sqlite3
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROGRAM = ROOT / "deploy/imac/backup-pocketbase.py"
RESTORE_PROGRAM = ROOT / "deploy/imac/restore-pocketbase-incremental.py"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def run_backup(pb_data, backup_dir, *extra, expect_success=True):
    command = [
        "/usr/bin/python3",
        str(PROGRAM),
        "--pb-data-dir", str(pb_data),
        "--backup-dir", str(backup_dir),
        "--reserve-bytes", "0",
        *extra,
    ]
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    if expect_success and result.returncode != 0:
        raise RuntimeError("backup fixture failed: %s" % (result.stderr or result.stdout))
    if not expect_success and result.returncode == 0:
        raise AssertionError("backup conflict should fail")
    return result


def create_fixture(pb_data):
    storage = pb_data / "storage"
    storage.mkdir(parents=True)
    database = sqlite3.connect(pb_data / "data.db")
    database.execute("CREATE TABLE _collections (id TEXT, name TEXT, type TEXT, fields TEXT)")
    collections = [
        ("media_id", "media", "base", [
            {"name": "file", "type": "file", "maxSelect": 1},
            {"name": "web_video", "type": "file", "maxSelect": 1},
            {"name": "video_poster", "type": "file", "maxSelect": 1},
        ]),
        ("programs_id", "programs", "base", [
            {"name": "download_files", "type": "file", "maxSelect": 8},
        ]),
        ("album_view", "album_items", "view", [
            {"name": "file", "type": "file", "maxSelect": 1},
        ]),
    ]
    for collection_id, name, kind, fields in collections:
        database.execute("INSERT INTO _collections VALUES (?, ?, ?, ?)", (collection_id, name, kind, json.dumps(fields)))
    database.execute("CREATE TABLE media (id TEXT, file TEXT, web_video TEXT, video_poster TEXT)")
    database.execute("CREATE TABLE programs (id TEXT, download_files TEXT)")
    database.execute("INSERT INTO media VALUES ('record1', 'original clip.mov', 'playback.mp4', 'poster.jpg')")
    database.execute("INSERT INTO programs VALUES ('program1', ?)", (json.dumps(["one.zip", "two.pdf"]),))
    database.commit()
    database.close()

    fixture_files = {
        "media_id/record1/original clip.mov": b"ORIGINAL-VIDEO",
        "media_id/record1/playback.mp4": b"DERIVED-VIDEO",
        "media_id/record1/poster.jpg": b"DERIVED-POSTER",
        "programs_id/program1/one.zip": b"PROGRAM-ONE",
        "programs_id/program1/two.pdf": b"PROGRAM-TWO",
    }
    for relative, contents in fixture_files.items():
        target = storage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)


def main():
    with tempfile.TemporaryDirectory(prefix="cwk-backup-fixture-") as temp:
        root = Path(temp)
        pb_data = root / "pb_data"
        backup_dir = root / "backup"
        create_fixture(pb_data)

        dry_run = run_backup(pb_data, backup_dir, "--dry-run")
        dry_summary = json.loads(dry_run.stdout)
        require(dry_summary["original_files"] == 3, "dry-run must discover only original file fields")
        require(not backup_dir.exists(), "dry-run must not create the backup root")

        first = json.loads(run_backup(pb_data, backup_dir).stdout)
        require(first["copied_files"] == 3, "first run must copy three originals")
        require(first["original_files"] == 3, "manifest must contain three originals")
        originals = backup_dir / "incremental/originals/storage"
        require((originals / "media_id/record1/original clip.mov").is_file(), "media original missing")
        require((originals / "programs_id/program1/one.zip").is_file(), "program file missing")
        require(not (originals / "media_id/record1/playback.mp4").exists(), "web derivative must be excluded")
        require(not (originals / "media_id/record1/poster.jpg").exists(), "poster derivative must be excluded")

        snapshots = sorted((backup_dir / "incremental/db-snapshots").glob("data_*.db"))
        manifests = sorted((backup_dir / "incremental/manifests").glob("originals_*.json"))
        require(len(snapshots) == 1 and len(manifests) == 1, "snapshot and manifest must be created together")
        database = sqlite3.connect(snapshots[0])
        require(database.execute("PRAGMA quick_check").fetchone()[0] == "ok", "snapshot quick_check failed")
        database.close()

        second = json.loads(run_backup(pb_data, backup_dir).stdout)
        require(second["copied_files"] == 0, "second run must not duplicate originals")

        restore_target = root / "restored-pb_data"
        restore = subprocess.run([
            "/usr/bin/python3", str(RESTORE_PROGRAM),
            "--snapshot", str(snapshots[0]),
            "--manifest", str(manifests[0]),
            "--originals-root", str(originals),
            "--target", str(restore_target),
            "--verify-all",
        ], cwd=ROOT, text=True, capture_output=True)
        require(restore.returncode == 0, "incremental restore fixture failed: %s" % restore.stderr)
        restore_summary = json.loads(restore.stdout)
        require(restore_summary["cloned_originals"] == 3, "restore must clone all manifest originals")
        require((restore_target / "data.db").is_file(), "restored data.db missing")
        require((restore_target / "storage/media_id/record1/original clip.mov").is_file(), "restored media original missing")
        require(not (restore_target / "storage/media_id/record1/playback.mp4").exists(), "restore must not invent derivatives")

        source = pb_data / "storage/media_id/record1/original clip.mov"
        previous_mtime = source.stat().st_mtime_ns
        source.write_bytes(b"CHANGED!-VIDEO")
        source.touch()
        if source.stat().st_mtime_ns == previous_mtime:
            source.touch()
        conflict = run_backup(pb_data, backup_dir, expect_success=False)
        require("append-only backup checksum conflict" in conflict.stderr, "changed original must fail without overwrite")
        require((originals / "media_id/record1/original clip.mov").read_bytes() == b"ORIGINAL-VIDEO", "vault original was overwritten")

    print("Incremental PocketBase backup QA passed (20 checks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
