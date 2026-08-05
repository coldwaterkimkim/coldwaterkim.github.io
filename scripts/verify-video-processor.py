#!/usr/bin/env python3
"""Exercise direct, remux, and adaptive transcode video paths with tiny fixtures."""

import importlib.util
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSOR_PATH = ROOT / "deploy/imac/process-video-media.py"
FFMPEG = ROOT / ".local-bin/ffmpeg"
FFPROBE = ROOT / ".local-bin/ffprobe"


def load_processor():
    spec = importlib.util.spec_from_file_location("coldwaterkim_video_processor", PROCESSOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_fixture(processor, output, codec, faststart=True, fps=24):
    command = [
        str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=%d" % fps,
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
        "-t", "2", "-shortest", "-c:v", codec, "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k",
    ]
    if faststart:
        command.extend(["-movflags", "+faststart"])
    command.append(str(output))
    processor.run_command(command, 120)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    if not FFMPEG.is_file() or not FFPROBE.is_file():
        raise RuntimeError("local FFmpeg tools are missing")
    processor = load_processor()
    with tempfile.TemporaryDirectory(prefix="cwk-video-qa-") as raw_temp:
        temp = Path(raw_temp)

        direct = temp / "direct.mp4"
        make_fixture(processor, direct, "libx264", faststart=True)
        direct_info = processor.probe_media(FFPROBE, direct)
        require(processor.choose_playback_mode(direct, direct_info) == "original", "compatible fast-start H.264 should use the original")
        playback, mode = processor.create_playback(FFMPEG, FFPROBE, direct, temp / "direct-output", direct_info)
        require(playback is None and mode == "original", "direct path must not create a duplicate playback file")

        remux = temp / "remux.mov"
        make_fixture(processor, remux, "libx264", faststart=False)
        remux_info = processor.probe_media(FFPROBE, remux)
        require(processor.choose_playback_mode(remux, remux_info) == "remux", "compatible MOV should be remuxed")
        remux_output = temp / "remux-output"
        remux_output.mkdir()
        playback, mode = processor.create_playback(FFMPEG, FFPROBE, remux, remux_output, remux_info)
        require(mode == "remux" and playback.is_file(), "remux path must create a playback MP4")
        require(processor.is_faststart_mp4(playback), "remuxed playback must be fast-start MP4")

        transcode = temp / "transcode.mp4"
        make_fixture(processor, transcode, "mpeg4", faststart=False, fps=60)
        transcode_info = processor.probe_media(FFPROBE, transcode)
        require(processor.choose_playback_mode(transcode, transcode_info) == "transcode", "non-H.264 source should be transcoded")
        transcode_output = temp / "transcode-output"
        transcode_output.mkdir()
        old_force = os.environ.get("VIDEO_PROCESSOR_FORCE_SOFTWARE")
        os.environ["VIDEO_PROCESSOR_FORCE_SOFTWARE"] = "1"
        try:
            playback, mode = processor.create_playback(FFMPEG, FFPROBE, transcode, transcode_output, transcode_info)
        finally:
            if old_force is None:
                os.environ.pop("VIDEO_PROCESSOR_FORCE_SOFTWARE", None)
            else:
                os.environ["VIDEO_PROCESSOR_FORCE_SOFTWARE"] = old_force
        result = processor.probe_media(FFPROBE, playback)
        require(mode == "transcode-software", "forced software fallback must be observable")
        require(result["video_codec"] == "h264", "transcode output must be H.264")
        require(result["frame_rate"] <= 30.01, "transcode output must not exceed 30 fps")
        require(processor.is_faststart_mp4(playback), "transcode output must be fast-start MP4")
        require(processor.adaptive_bitrate_kbps(transcode, transcode_info) <= 3500, "360p bitrate must stay within its resolution cap")

    print("Video processor checks passed: direct original, remux, adaptive H.264 fallback.")


if __name__ == "__main__":
    main()
