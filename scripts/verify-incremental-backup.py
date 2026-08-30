#!/usr/bin/env python3
"""Exercise the incremental PocketBase backup against an isolated fixture."""

import json
import os
import sqlite3
import subprocess
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROGRAM = ROOT / "deploy/imac/backup-pocketbase.py"
RESTORE_PROGRAM = ROOT / "deploy/imac/restore-pocketbase-incremental.py"
ZIP_RESTORE_PROGRAM = ROOT / "deploy/imac/restore-pocketbase-backup.sh"


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


def run_incremental_restore(snapshot, manifest, originals, target, copy_mode="auto", expect_success=True):
    result = subprocess.run([
        "/usr/bin/python3", str(RESTORE_PROGRAM),
        "--snapshot", str(snapshot),
        "--manifest", str(manifest),
        "--originals-root", str(originals),
        "--target", str(target),
        "--copy-mode", copy_mode,
        "--reserve-bytes", "0",
        "--verify-all",
    ], cwd=ROOT, text=True, capture_output=True)
    if expect_success and result.returncode != 0:
        raise RuntimeError("incremental restore fixture failed: %s" % (result.stderr or result.stdout))
    if not expect_success and result.returncode == 0:
        raise AssertionError("unsafe incremental restore should fail")
    return result


def run_zip_restore(archive, target, *, home=None, expect_success=True):
    environment = os.environ.copy()
    if home is not None:
        environment["HOME"] = str(home)
    result = subprocess.run(
        ["/bin/bash", str(ZIP_RESTORE_PROGRAM), str(archive), str(target)],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
    )
    if expect_success and result.returncode != 0:
        raise RuntimeError("zip restore fixture failed: %s" % (result.stderr or result.stdout))
    if not expect_success and result.returncode == 0:
        raise AssertionError("unsafe zip restore should fail")
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
        latest_success = json.loads((backup_dir / "incremental/latest-success.json").read_text(encoding="utf-8"))
        require(latest_success["database"]["file"] == snapshots[0].name, "latest success must point at the complete snapshot")
        require(latest_success["manifest"] == manifests[0].name, "latest success must point at the complete manifest")
        database = sqlite3.connect(snapshots[0])
        require(database.execute("PRAGMA quick_check").fetchone()[0] == "ok", "snapshot quick_check failed")
        database.close()

        second = json.loads(run_backup(pb_data, backup_dir).stdout)
        require(second["copied_files"] == 0, "second run must not duplicate originals")

        restore_target = root / "restored-pb_data"
        restore = run_incremental_restore(snapshots[0], manifests[0], originals, restore_target, copy_mode="copy")
        restore_summary = json.loads(restore.stdout)
        require(restore_summary["copied_originals"] == 3, "forced copy restore must copy all manifest originals")
        require(restore_summary["cloned_originals"] == 0, "forced copy restore must not claim APFS clones")
        require(restore_summary["destination_verified_originals"] == 3, "restore must checksum every destination original")
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

        broken_pb_data = root / "broken-pb_data"
        broken_backup = root / "broken-backup"
        create_fixture(broken_pb_data)
        (broken_pb_data / "storage/media_id/record1/original clip.mov").unlink()
        failed = run_backup(broken_pb_data, broken_backup, expect_success=False)
        require("referenced original is missing" in failed.stderr, "missing source must fail after snapshot")
        require(not list((broken_backup / "incremental/db-snapshots").glob("*")), "failed run left a database snapshot")
        require(not list((broken_backup / "incremental/manifests").glob("*")), "failed run left a manifest")
        require(not (broken_backup / "incremental/latest-success.json").exists(), "failed run published latest success")

        archive = root / "pocketbase-backup.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.write(snapshots[0], "data.db")
        zip_target = root / "zip-restored-pb_data"
        run_zip_restore(archive, zip_target)
        require((zip_target / "data.db").is_file(), "safe zip restore did not create data.db")

        existing_target = root / "existing-restore"
        existing_target.mkdir()
        sentinel = existing_target / "keep-me.txt"
        sentinel.write_text("keep", encoding="utf-8")
        run_zip_restore(archive, existing_target, expect_success=False)
        require(sentinel.read_text(encoding="utf-8") == "keep", "existing restore target was modified")

        fake_home = root / "fake-home"
        fake_home.mkdir()
        fake_runtime = fake_home / ".local/share/coldwaterkim/home-server/pb_data"
        run_zip_restore(archive, fake_runtime, home=fake_home, expect_success=False)
        require(not fake_runtime.exists(), "restore wrote into the canonical production path")

        traversal_archive = root / "traversal.zip"
        with zipfile.ZipFile(traversal_archive, "w") as bundle:
            bundle.writestr("data.db", b"not-a-database")
            bundle.writestr("../escaped.txt", b"escape")
        run_zip_restore(traversal_archive, root / "traversal-target", expect_success=False)
        require(not (root / "escaped.txt").exists(), "zip traversal escaped the restore target")

    print("Incremental PocketBase backup and restore QA passed (36 checks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
