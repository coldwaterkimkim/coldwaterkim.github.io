#!/usr/bin/env python3
"""Create web MP4 and JPEG poster derivatives without modifying originals."""

import argparse
import fcntl
import http.client
import json
import mimetypes
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm"}
VIDEO_URL_RE = re.compile(r"/api/files/[^/]+/([a-z0-9]{15})/[^\s\"'<>?]+\.(?:mp4|mov|m4v|webm)", re.I)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-once", action="store_true", help="process one pending/processing video")
    parser.add_argument("--enqueue-referenced", action="store_true", help="queue videos referenced by local content")
    parser.add_argument("--enqueue-id", action="append", default=[], help="queue one media record id")
    parser.add_argument("--retry-errors", action="store_true", help="reset failed media records for another retry cycle")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_env_file(path):
    values = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


class PocketBaseClient:
    def __init__(self, base_url, email, password):
        self.base_url = base_url.rstrip("/")
        self.token = self._authenticate(email, password)

    def _request_json(self, method, path, payload=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if getattr(self, "token", ""):
            headers["Authorization"] = self.token
        request = urllib.request.Request(self.base_url + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:500]
            raise RuntimeError("PocketBase %s %s failed (%s): %s" % (method, path, error.code, detail))
        return json.loads(data.decode("utf-8")) if data else {}

    def _authenticate(self, email, password):
        self.token = ""
        payload = {"identity": email, "password": password}
        try:
            result = self._request_json("POST", "/api/collections/_superusers/auth-with-password", payload)
        except RuntimeError:
            result = self._request_json("POST", "/api/admins/auth-with-password", payload)
        token = result.get("token", "")
        if not token:
            raise RuntimeError("PocketBase authentication returned no token")
        return token

    def get_record(self, record_id):
        fields = "id,collectionId,file,web_video,video_poster,video_status,video_attempts"
        return self._request_json("GET", "/api/collections/media/records/%s?fields=%s" % (record_id, fields))

    def patch_json(self, record_id, payload):
        return self._request_json("PATCH", "/api/collections/media/records/%s" % record_id, payload)

    def next_record(self):
        filters = ('video_status="processing"', 'video_status="pending"', 'video_status="error"&&video_attempts<3')
        for record_filter in filters:
            query = urllib.parse.urlencode({
                "page": 1,
                "perPage": 1,
                "sort": "created",
                "filter": record_filter,
                "fields": "id,collectionId,file,web_video,video_poster,video_status,video_attempts",
            })
            result = self._request_json("GET", "/api/collections/media/records?" + query)
            if result.get("items"):
                return result["items"][0]
        return None

    def records_with_status(self, status):
        query = urllib.parse.urlencode({"perPage": 500, "filter": 'video_status="%s"' % status, "fields": "id"})
        return self._request_json("GET", "/api/collections/media/records?" + query).get("items", [])

    def upload_files(self, record_id, fields, files):
        return self._multipart_patch("/api/collections/media/records/%s" % record_id, fields, files)

    def _multipart_patch(self, path, fields, files):
        parsed = urllib.parse.urlparse(self.base_url)
        if parsed.scheme not in ("http", "https"):
            raise RuntimeError("Unsupported PocketBase URL scheme")
        boundary = "----cwk-video-%s" % uuid.uuid4().hex
        chunks = []
        total = 0
        for name, value in fields.items():
            chunk = ("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (boundary, name, value)).encode("utf-8")
            chunks.append(("bytes", chunk))
            total += len(chunk)
        for name, file_path in files.items():
            mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            header = ("--%s\r\nContent-Disposition: form-data; name=\"%s\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n" % (boundary, name, file_path.name, mime)).encode("utf-8")
            trailer = b"\r\n"
            chunks.extend((("bytes", header), ("file", file_path), ("bytes", trailer)))
            total += len(header) + file_path.stat().st_size + len(trailer)
        closing = ("--%s--\r\n" % boundary).encode("utf-8")
        chunks.append(("bytes", closing))
        total += len(closing)

        connection_class = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        connection = connection_class(parsed.hostname, parsed.port, timeout=300)
        request_path = (parsed.path.rstrip("/") + path) or "/"
        connection.putrequest("PATCH", request_path)
        connection.putheader("Authorization", self.token)
        connection.putheader("Content-Type", "multipart/form-data; boundary=%s" % boundary)
        connection.putheader("Content-Length", str(total))
        connection.endheaders()
        for kind, value in chunks:
            if kind == "bytes":
                connection.send(value)
            else:
                with value.open("rb") as handle:
                    while True:
                        data = handle.read(1024 * 1024)
                        if not data:
                            break
                        connection.send(data)
        response = connection.getresponse()
        body = response.read()
        connection.close()
        if response.status >= 400:
            raise RuntimeError("PocketBase derivative upload failed (%s): %s" % (response.status, body.decode("utf-8", "replace")[:500]))
        return json.loads(body.decode("utf-8")) if body else {}


def run_command(command, timeout):
    try:
        return subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError("FFmpeg command timed out")
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or b"").decode("utf-8", "replace").strip()[-500:]
        raise RuntimeError("FFmpeg command failed: %s" % detail)


def command_json(command, timeout=120):
    result = run_command(command, timeout)
    return json.loads(result.stdout.decode("utf-8"))


def validate_original_path(runtime_root, record):
    filename = str(record.get("file") or "")
    if Path(filename).suffix.lower() not in VIDEO_SUFFIXES:
        raise RuntimeError("record is not a supported video")
    collection_id = str(record.get("collectionId") or "")
    record_id = str(record.get("id") or "")
    if not re.fullmatch(r"[A-Za-z0-9_]+", collection_id) or not re.fullmatch(r"[a-z0-9]{15}", record_id):
        raise RuntimeError("invalid PocketBase storage identifiers")
    path = runtime_root / "pb_data" / "storage" / collection_id / record_id / filename
    resolved = path.resolve()
    storage_root = (runtime_root / "pb_data" / "storage").resolve()
    if storage_root not in resolved.parents or not resolved.is_file():
        raise RuntimeError("original video file is missing")
    return resolved


def parse_rate(value):
    try:
        numerator, denominator = str(value or "0/1").split("/", 1)
        return float(numerator) / float(denominator) if float(denominator) else 0
    except (TypeError, ValueError):
        return 0


def probe_media(ffprobe, source):
    probe = command_json([
        str(ffprobe), "-v", "error", "-show_entries",
        "format=duration,format_name,bit_rate:stream=index,codec_type,codec_name,profile,width,height,pix_fmt,avg_frame_rate,r_frame_rate:stream_tags=rotate:stream_side_data=rotation",
        "-of", "json", str(source),
    ])
    video = next((stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"), {})
    audio = next((stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"), {})
    rotation = video.get("tags", {}).get("rotate", 0)
    for side_data in video.get("side_data_list", []):
        if side_data.get("rotation") is not None:
            rotation = side_data["rotation"]
            break
    try:
        rotation = int(float(rotation or 0)) % 360
    except (TypeError, ValueError):
        rotation = 0
    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    if rotation in (90, 270):
        width, height = height, width
    format_info = probe.get("format", {})
    return {
        "duration": float(format_info.get("duration") or 0),
        "format_name": str(format_info.get("format_name") or ""),
        "bit_rate": int(format_info.get("bit_rate") or 0),
        "video_codec": str(video.get("codec_name") or "").lower(),
        "video_profile": str(video.get("profile") or ""),
        "width": width,
        "height": height,
        "pix_fmt": str(video.get("pix_fmt") or "").lower(),
        "frame_rate": parse_rate(video.get("avg_frame_rate") or video.get("r_frame_rate")),
        "audio_codec": str(audio.get("codec_name") or "").lower(),
    }


def probe_duration(ffprobe, source):
    return probe_media(ffprobe, source)["duration"]


def mp4_atom_order(path):
    positions = {}
    file_size = path.stat().st_size
    with path.open("rb") as handle:
        offset = 0
        while offset + 8 <= file_size:
            handle.seek(offset)
            header = handle.read(16)
            if len(header) < 8:
                break
            size = int.from_bytes(header[:4], "big")
            atom = header[4:8].decode("latin-1")
            header_size = 8
            if size == 1:
                if len(header) < 16:
                    break
                size = int.from_bytes(header[8:16], "big")
                header_size = 16
            elif size == 0:
                size = file_size - offset
            if size < header_size or offset + size > file_size:
                break
            if atom in ("moov", "mdat") and atom not in positions:
                positions[atom] = offset
            offset += size
    return positions


def is_faststart_mp4(path):
    positions = mp4_atom_order(path)
    return "moov" in positions and "mdat" in positions and positions["moov"] < positions["mdat"]


def is_h264_web_compatible(info):
    return (
        info["video_codec"] == "h264"
        and info["width"] > 0 and info["height"] > 0
        and info["width"] <= 1920 and info["height"] <= 1080
        and info["frame_rate"] <= 30.01
        and info["pix_fmt"] in {"yuv420p", "nv12"}
    )


def choose_playback_mode(source, info):
    if is_h264_web_compatible(info):
        if source.suffix.lower() == ".mp4" and info["audio_codec"] in ("", "aac") and is_faststart_mp4(source):
            return "original"
        return "remux"
    return "transcode"


def adaptive_bitrate_kbps(source, info):
    pixels = max(1, info["width"] * info["height"])
    if pixels <= 640 * 480:
        resolution_cap = 1800
    elif pixels <= 1280 * 720:
        resolution_cap = 3500
    else:
        resolution_cap = 6000
    source_kbps = max(0, info["bit_rate"] // 1000)
    source_based = max(750, int(source_kbps * 1.20)) if source_kbps else resolution_cap
    duration = max(0.001, info["duration"])
    size_budget = max(750, int(((source.stat().st_size * 8 * 1.10) / duration - 128000) / 1000))
    return max(750, min(resolution_cap, source_based, size_budget))


def create_poster(ffmpeg, source, output_dir, duration):
    seek = min(2.0, max(0.1, duration * 0.1)) if duration else 0.1
    poster = output_dir / "poster.jpg"
    scale = "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"

    run_command([
        str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y", "-ss", "%.3f" % seek,
        "-i", str(source), "-frames:v", "1", "-vf", scale, "-q:v", "3", str(poster),
    ], 120)
    if not poster.is_file():
        raise RuntimeError("FFmpeg did not create the expected poster")
    return poster


def validate_playback(ffmpeg, ffprobe, source_info, playback):
    info = probe_media(ffprobe, playback)
    if not is_h264_web_compatible(info):
        raise RuntimeError("web playback is not compatible H.264 1080p/30fps yuv420p")
    if info["audio_codec"] not in ("", "aac"):
        raise RuntimeError("web playback audio is not AAC")
    if not is_faststart_mp4(playback):
        raise RuntimeError("web playback is missing MP4 fast start")
    tolerance = max(1.0, source_info["duration"] * 0.01)
    if abs(info["duration"] - source_info["duration"]) > tolerance:
        raise RuntimeError("web playback duration differs from the original")
    duration = max(0.1, info["duration"])
    for seek in (0, max(0, duration - 1.0)):
        run_command([
            str(ffmpeg), "-hide_banner", "-loglevel", "error", "-ss", "%.3f" % seek,
            "-i", str(playback), "-t", "0.5", "-map", "0:v:0", "-f", "null", "-",
        ], 60)
    return info


def create_playback(ffmpeg, ffprobe, source, output_dir, info=None):
    info = info or probe_media(ffprobe, source)
    mode = choose_playback_mode(source, info)
    if mode == "original":
        return None, mode
    playback = output_dir / "playback.mp4"
    common = [
        str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-map", "0:v:0", "-map", "0:a:0?",
    ]
    if mode == "remux":
        audio = ["-c:a", "copy"] if info["audio_codec"] in ("", "aac") else ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]
        command = common + ["-c:v", "copy"] + audio + ["-movflags", "+faststart", str(playback)]
        run_command(command, max(300, int(info["duration"] * 4)))
    else:
        bitrate = adaptive_bitrate_kbps(source, info)
        scale = "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p"
        if info["frame_rate"] > 30.01:
            scale += ",fps=30"
        common_output = [
            "-vf", scale, "-b:v", "%dk" % bitrate,
            "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", str(playback),
        ]
        videotoolbox = common + [
            "-c:v", "h264_videotoolbox", "-allow_sw", "0", "-profile:v", "high", "-level", "4.1",
        ] + common_output
        software = common + [
            "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-level", "4.1",
            "-maxrate", "%dk" % bitrate, "-bufsize", "%dk" % (bitrate * 2),
        ] + common_output
        force_software = os.environ.get("VIDEO_PROCESSOR_FORCE_SOFTWARE") == "1"
        if force_software:
            run_command(software, max(300, int(info["duration"] * 10)))
            mode = "transcode-software"
        else:
            try:
                run_command(videotoolbox, max(300, int(info["duration"] * 10)))
                mode = "transcode-videotoolbox"
            except RuntimeError as error:
                print("VideoToolbox unavailable; using libx264 fallback: %s" % error, file=sys.stderr)
                run_command(software, max(300, int(info["duration"] * 10)))
                mode = "transcode-software"
    if not playback.is_file():
        raise RuntimeError("FFmpeg did not create the expected playback file")
    validate_playback(ffmpeg, ffprobe, info, playback)
    return playback, mode


def create_derivatives(ffmpeg, ffprobe, source, output_dir):
    info = probe_media(ffprobe, source)
    poster = create_poster(ffmpeg, source, output_dir, info["duration"])
    playback, mode = create_playback(ffmpeg, ffprobe, source, output_dir, info)
    return playback, poster, mode


def discover_referenced_ids(database_path):
    uri = "file:%s?mode=ro" % urllib.parse.quote(str(database_path))
    connection = sqlite3.connect(uri, uri=True)
    ids = set()
    try:
        tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\'")]
        for table in tables:
            columns = [row[1] for row in connection.execute('PRAGMA table_info("%s")' % table.replace('"', '""')) if str(row[2]).upper() in ("TEXT", "JSON", "")]
            for column in columns:
                query = 'SELECT "%s" FROM "%s" WHERE "%s" LIKE \'%%/api/files/%%\'' % (column.replace('"', '""'), table.replace('"', '""'), column.replace('"', '""'))
                for row in connection.execute(query):
                    for match in VIDEO_URL_RE.finditer(str(row[0] or "")):
                        ids.add(match.group(1))
    finally:
        connection.close()
    return sorted(ids)


def main():
    args = parse_args()
    runtime_root = Path(os.environ.get("VIDEO_PROCESSOR_RUNTIME_ROOT", Path.home() / ".local/share/coldwaterkim/home-server")).resolve()
    env_file = Path(os.environ.get("PB_ADMIN_ENV_FILE", Path.home() / ".config/coldwaterkim/pocketbase-admin.env"))
    env = load_env_file(env_file)
    email = os.environ.get("PB_ADMIN_EMAIL") or env.get("PB_ADMIN_EMAIL")
    password = os.environ.get("PB_ADMIN_PASSWORD") or env.get("PB_ADMIN_PASSWORD")
    if not email or not password:
        raise RuntimeError("PocketBase admin credentials are missing")
    base_url = os.environ.get("PB_LOCAL_URL", "http://127.0.0.1:8090")
    client = PocketBaseClient(base_url, email, password)

    if args.retry_errors:
        for item in client.records_with_status("error"):
            if args.dry_run:
                print("would retry media %s" % item["id"])
            else:
                client.patch_json(item["id"], {"video_status": "pending", "video_error": "", "video_attempts": 0})
                print("reset media %s" % item["id"])

    enqueue_ids = set(args.enqueue_id)
    if args.enqueue_referenced:
        enqueue_ids.update(discover_referenced_ids(runtime_root / "pb_data" / "data.db"))
    for record_id in sorted(enqueue_ids):
        if args.dry_run:
            print("would queue media %s" % record_id)
        else:
            record = client.get_record(record_id)
            if (Path(str(record.get("file") or "")).suffix.lower() in VIDEO_SUFFIXES
                    and not record.get("web_video") and record.get("video_status") != "ready"):
                client.patch_json(record_id, {"video_status": "pending", "video_error": "", "video_attempts": 0})
                print("queued media %s" % record_id)

    if not args.run_once or args.dry_run:
        return 0

    lock_path = runtime_root / "video-processor.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0
        record = client.next_record()
        if not record:
            return 0
        record_id = record["id"]
        attempts = int(record.get("video_attempts") or 0) + 1
        try:
            client.patch_json(record_id, {"video_status": "processing", "video_error": "", "video_attempts": attempts})
            source = validate_original_path(runtime_root, record)
            with tempfile.TemporaryDirectory(prefix="cwk-video-", dir=str(runtime_root)) as temp_dir:
                output_dir = Path(temp_dir)
                ffmpeg = runtime_root / "bin/ffmpeg"
                ffprobe = runtime_root / "bin/ffprobe"
                info = probe_media(ffprobe, source)
                poster = create_poster(ffmpeg, source, output_dir, info["duration"])
                client.upload_files(record_id, {"video_status": "processing", "video_error": ""}, {"video_poster": poster})
                playback, mode = create_playback(ffmpeg, ffprobe, source, output_dir, info)
                if playback is None:
                    client.patch_json(record_id, {"video_status": "ready", "video_error": ""})
                else:
                    try:
                        client.upload_files(record_id, {"video_status": "ready", "video_error": ""}, {"web_video": playback})
                    except Exception:
                        recovered = client.get_record(record_id)
                        if recovered.get("web_video") and recovered.get("video_poster"):
                            client.patch_json(record_id, {"video_status": "ready", "video_error": ""})
                        else:
                            raise
            print("processed media %s (%s)" % (record_id, mode))
        except Exception as error:
            message = str(error).replace(str(runtime_root), "<runtime>")[:500]
            try:
                client.patch_json(record_id, {"video_status": "error", "video_error": message, "video_attempts": attempts})
            except Exception:
                pass
            raise
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print("video processor failed: %s" % error, file=sys.stderr)
        sys.exit(1)
