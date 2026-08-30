#!/usr/bin/env python3
"""Back up PocketBase metadata and immutable user originals incrementally."""

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path


DERIVATIVE_FIELDS = {("media", "web_video"), ("media", "video_poster")}
SNAPSHOT_PATTERN = re.compile(r"^data_(\d{8}_\d{6}(?:_\d{6})?)\.db$")
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
DEFAULT_RESERVE_BYTES = 10 * 1024 * 1024 * 1024


def parse_args():
    home = Path.home()
    runtime_root = Path(os.environ.get("IMAC_RUNTIME_ROOT", home / ".local/share/coldwaterkim/home-server"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pb-data-dir", type=Path, default=Path(os.environ.get("PB_DATA_DIR", runtime_root / "pb_data")))
    parser.add_argument("--backup-dir", type=Path, default=Path(os.environ.get("BACKUP_DIR", home / "Backups/coldwaterkim-pocketbase")))
    parser.add_argument("--database-retention-days", type=int, default=int(os.environ.get("DATABASE_RETENTION_DAYS", "30")))
    parser.add_argument("--reserve-bytes", type=int, default=int(os.environ.get("BACKUP_RESERVE_BYTES", str(DEFAULT_RESERVE_BYTES))))
    parser.add_argument("--verify-all", action="store_true", help="rehash every existing original instead of changed/new files only")
    parser.add_argument("--dry-run", action="store_true", help="inspect the live database and report without writing backups")
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


def quote_identifier(value):
    if not IDENTIFIER_PATTERN.fullmatch(value):
        raise RuntimeError("unsafe database identifier: %r" % value)
    return '"%s"' % value.replace('"', '""')


def normalize_file_value(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item) for item in value if str(item)]
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, list):
            return [str(item) for item in parsed if str(item)]
    return [text]


def safe_child(root, *parts):
    root = root.resolve()
    candidate = root.joinpath(*parts).resolve()
    if candidate == root or root not in candidate.parents:
        raise RuntimeError("backup path escapes its root: %s" % candidate)
    return candidate


def validate_roots(pb_data_dir, backup_dir):
    pb_data_dir = pb_data_dir.expanduser().resolve()
    backup_dir = backup_dir.expanduser().resolve()
    if pb_data_dir in (Path("/"), Path.home().resolve()) or backup_dir in (Path("/"), Path.home().resolve()):
        raise RuntimeError("refusing broad PocketBase or backup root")
    if not (pb_data_dir / "data.db").is_file():
        raise RuntimeError("missing PocketBase data.db: %s" % (pb_data_dir / "data.db"))
    return pb_data_dir, backup_dir


def snapshot_database(source_path, destination_path):
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination_path.with_name(".%s.tmp.%s" % (destination_path.name, os.getpid()))
    if temp_path.exists():
        temp_path.unlink()
    try:
        source_uri = "file:%s?mode=ro" % source_path.as_posix()
        source = sqlite3.connect(source_uri, uri=True, timeout=30)
        try:
            destination = sqlite3.connect(str(temp_path))
            try:
                source.backup(destination)
                destination.commit()
                # PocketBase runs data.db in WAL mode. A standalone snapshot must use
                # DELETE journaling so it can be opened without a matching -wal file.
                journal_mode = destination.execute("PRAGMA journal_mode=DELETE").fetchone()
                if not journal_mode or str(journal_mode[0]).lower() != "delete":
                    raise RuntimeError("failed to make SQLite snapshot standalone")
                result = destination.execute("PRAGMA quick_check").fetchone()
                if not result or result[0] != "ok":
                    raise RuntimeError("SQLite quick_check failed: %r" % (result,))
            finally:
                destination.close()
        finally:
            source.close()
        os.replace(temp_path, destination_path)
        return sha256_file(destination_path)
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


def load_state(path):
    if not path.is_file():
        return {"version": 1, "files": {}}
    with path.open("r", encoding="utf-8") as handle:
        state = json.load(handle)
    if state.get("version") != 1 or not isinstance(state.get("files"), dict):
        raise RuntimeError("unsupported originals state file: %s" % path)
    return state


def write_json_atomic(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(".%s.tmp.%s" % (path.name, os.getpid()))
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, path)


def write_text_atomic(path, contents):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(".%s.tmp.%s" % (path.name, os.getpid()))
    with temp_path.open("w", encoding="utf-8") as handle:
        handle.write(contents)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_path, path)


def discover_originals(database_path, pb_data_dir):
    connection = sqlite3.connect("file:%s?mode=ro&immutable=1" % database_path.as_posix(), uri=True)
    connection.row_factory = sqlite3.Row
    storage_root = (pb_data_dir / "storage").resolve()
    originals = []
    try:
        collections = connection.execute("SELECT id, name, type, fields FROM _collections ORDER BY name").fetchall()
        for collection in collections:
            if collection["type"] == "view":
                continue
            try:
                fields = json.loads(collection["fields"] or "[]")
            except json.JSONDecodeError as error:
                raise RuntimeError("invalid field schema for %s: %s" % (collection["name"], error))
            file_fields = [
                field["name"] for field in fields
                if field.get("type") == "file"
                and (collection["name"], field.get("name")) not in DERIVATIVE_FIELDS
            ]
            if not file_fields:
                continue
            columns = ", ".join([quote_identifier("id")] + [quote_identifier(name) for name in file_fields])
            query = "SELECT %s FROM %s" % (columns, quote_identifier(collection["name"]))
            for record in connection.execute(query):
                for field_name in file_fields:
                    for filename in normalize_file_value(record[field_name]):
                        relative = Path(collection["id"]) / str(record["id"]) / filename
                        source = (storage_root / relative).resolve()
                        if storage_root not in source.parents:
                            raise RuntimeError("storage file escapes PocketBase storage: %s" % source)
                        if not source.is_file():
                            raise RuntimeError("referenced original is missing: %s" % source)
                        originals.append({
                            "collection": collection["name"],
                            "collection_id": collection["id"],
                            "record_id": str(record["id"]),
                            "field": field_name,
                            "filename": filename,
                            "relative_path": relative.as_posix(),
                            "source": source,
                        })
    finally:
        connection.close()
    originals.sort(key=lambda item: (item["relative_path"], item["field"]))
    return originals


def copy_originals(originals, originals_root, state, verify_all=False, dry_run=False, reserve_bytes=DEFAULT_RESERVE_BYTES):
    new_bytes = 0
    for item in originals:
        destination = safe_child(originals_root, item["relative_path"])
        if not destination.exists():
            new_bytes += item["source"].stat().st_size
    if not dry_run:
        originals_root.mkdir(parents=True, exist_ok=True)
        free_bytes = shutil.disk_usage(originals_root).free
        if free_bytes < new_bytes + reserve_bytes:
            raise RuntimeError("insufficient backup space: need %d bytes plus %d reserve, have %d" % (new_bytes, reserve_bytes, free_bytes))

    copied = 0
    verified = 0
    manifest_items = []
    state_files = state["files"]
    for item in originals:
        source = item["source"]
        source_stat = source.stat()
        relative_path = item["relative_path"]
        destination = safe_child(originals_root, relative_path)
        previous = state_files.get(relative_path, {})
        checksum = previous.get("sha256", "")
        must_verify = verify_all or not checksum or not destination.is_file()
        if destination.is_file():
            destination_stat = destination.stat()
            if destination_stat.st_size != source_stat.st_size:
                raise RuntimeError("append-only backup conflict for %s" % relative_path)
            if previous.get("source_mtime_ns") != source_stat.st_mtime_ns:
                must_verify = True
        if must_verify:
            source_checksum = sha256_file(source)
            if destination.is_file():
                destination_checksum = sha256_file(destination)
                if destination_checksum != source_checksum:
                    raise RuntimeError("append-only backup checksum conflict for %s" % relative_path)
                verified += 1
            elif not dry_run:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(prefix=".original-", dir=str(destination.parent), delete=False) as temp:
                    temp_path = Path(temp.name)
                try:
                    shutil.copy2(source, temp_path)
                    destination_checksum = sha256_file(temp_path)
                    if destination_checksum != source_checksum:
                        raise RuntimeError("copied original checksum mismatch for %s" % relative_path)
                    os.replace(temp_path, destination)
                finally:
                    if temp_path.exists():
                        temp_path.unlink()
                copied += 1
            checksum = source_checksum
        if not checksum:
            checksum = "dry-run-unverified"
        state_files[relative_path] = {
            "sha256": checksum,
            "size": source_stat.st_size,
            "source_mtime_ns": source_stat.st_mtime_ns,
        }
        manifest_item = {key: value for key, value in item.items() if key != "source"}
        manifest_item.update({"size": source_stat.st_size, "sha256": checksum})
        manifest_items.append(manifest_item)
    return manifest_items, copied, verified, new_bytes


def prune_snapshots(snapshot_dir, manifest_dir, retention_days, now):
    if retention_days < 1 or not snapshot_dir.is_dir():
        return []
    cutoff = now - timedelta(days=retention_days)
    removed = []
    for path in snapshot_dir.iterdir():
        match = SNAPSHOT_PATTERN.fullmatch(path.name)
        if not match or not path.is_file():
            continue
        timestamp = match.group(1)
        timestamp_format = "%Y%m%d_%H%M%S_%f" if len(timestamp) > 15 else "%Y%m%d_%H%M%S"
        created = datetime.strptime(timestamp, timestamp_format)
        if created >= cutoff:
            continue
        for candidate in (path, path.with_suffix(path.suffix + ".sha256"), manifest_dir / ("originals_%s.json" % match.group(1))):
            if candidate.is_file():
                candidate.unlink()
        removed.append(path.name)
    return removed


def main():
    args = parse_args()
    pb_data_dir, backup_dir = validate_roots(args.pb_data_dir, args.backup_dir)
    now = datetime.now()
    timestamp = now.strftime("%Y%m%d_%H%M%S_%f")
    incremental_root = backup_dir / "incremental"
    snapshot_dir = incremental_root / "db-snapshots"
    manifest_dir = incremental_root / "manifests"
    originals_root = incremental_root / "originals" / "storage"
    state_path = incremental_root / "state" / "originals.json"

    if args.dry_run:
        originals = discover_originals(pb_data_dir / "data.db", pb_data_dir)
        total = sum(item["source"].stat().st_size for item in originals)
        print(json.dumps({"dry_run": True, "original_files": len(originals), "original_bytes": total}, sort_keys=True))
        return 0

    incremental_root.mkdir(parents=True, exist_ok=True)
    lock_path = incremental_root / ".backup.lock"
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Incremental backup already running; skipped.")
            return 0

        snapshot_path = snapshot_dir / ("data_%s.db" % timestamp)
        checksum_path = snapshot_path.with_suffix(snapshot_path.suffix + ".sha256")
        manifest_path = manifest_dir / ("originals_%s.json" % timestamp)
        generation_complete = False
        try:
            database_checksum = snapshot_database(pb_data_dir / "data.db", snapshot_path)
            write_text_atomic(checksum_path, "%s  %s\n" % (database_checksum, snapshot_path.name))
            originals = discover_originals(snapshot_path, pb_data_dir)
            state = load_state(state_path)
            verify_all = args.verify_all or now.weekday() == 6
            manifest_items, copied, verified, new_bytes = copy_originals(
                originals,
                originals_root,
                state,
                verify_all=verify_all,
                reserve_bytes=args.reserve_bytes,
            )
            state["updated_at"] = now.isoformat(timespec="seconds")
            write_json_atomic(state_path, state)
            manifest = {
                "version": 1,
                "created_at": now.isoformat(timespec="seconds"),
                "database": {"file": snapshot_path.name, "sha256": database_checksum},
                "originals": manifest_items,
            }
            write_json_atomic(manifest_path, manifest)
            write_json_atomic(incremental_root / "latest-success.json", {
                "version": 1,
                "created_at": manifest["created_at"],
                "database": manifest["database"],
                "manifest": manifest_path.name,
                "original_files": len(manifest_items),
            })
            generation_complete = True
        finally:
            if not generation_complete:
                for incomplete_path in (manifest_path, checksum_path, snapshot_path):
                    try:
                        incomplete_path.unlink()
                    except FileNotFoundError:
                        pass
        removed = prune_snapshots(snapshot_dir, manifest_dir, args.database_retention_days, now)
        print(json.dumps({
            "snapshot": str(snapshot_path),
            "original_files": len(manifest_items),
            "copied_files": copied,
            "verified_existing_files": verified,
            "new_bytes": new_bytes,
            "verify_all": verify_all,
            "pruned_snapshots": removed,
        }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("incremental backup failed: %s" % error, file=sys.stderr)
        sys.exit(1)
