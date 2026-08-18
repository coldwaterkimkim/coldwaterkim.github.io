package main

import (
	"context"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestValidateBGMTrimRange(t *testing.T) {
	tests := []struct {
		name       string
		start, end float64
		duration   float64
		valid      bool
	}{
		{"valid middle", 12.5, 40.25, 180, true},
		{"valid exact end", 0, 180, 180, true},
		{"negative start", -1, 10, 180, false},
		{"too short", 2, 2.1, 180, false},
		{"reverse", 10, 5, 180, false},
		{"past duration", 0, 181, 180, false},
		{"nan", math.NaN(), 1, 180, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateBGMTrimRange(test.start, test.end, test.duration)
			if test.valid && err != nil {
				t.Fatalf("expected valid range, got %v", err)
			}
			if !test.valid && err == nil {
				t.Fatal("expected invalid range")
			}
		})
	}
}

func TestBGMTrimWithFFmpeg(t *testing.T) {
	ffmpeg := filepath.Clean("../../../.local-bin/ffmpeg")
	ffprobe := filepath.Clean("../../../.local-bin/ffprobe")
	if _, err := os.Stat(ffmpeg); err != nil {
		t.Skip("repo FFmpeg runtime is not installed")
	}
	if _, err := os.Stat(ffprobe); err != nil {
		t.Skip("repo ffprobe runtime is not installed")
	}

	dir := t.TempDir()
	source := filepath.Join(dir, "source.mp3")
	trimmed := filepath.Join(dir, "trimmed.mp3")
	generate := exec.Command(ffmpeg,
		"-hide_banner", "-loglevel", "error", "-f", "lavfi",
		"-i", "sine=frequency=440:duration=3", "-codec:a", "libmp3lame", source,
	)
	if output, err := generate.CombinedOutput(); err != nil {
		t.Fatalf("generate fixture: %v: %s", err, output)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := runBGMTrim(ctx, ffmpeg, source, trimmed, 0.5, 2.0); err != nil {
		t.Fatal(err)
	}
	duration, err := probeAudioDuration(ctx, ffprobe, trimmed)
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(duration-1.5) > 0.3 {
		t.Fatalf("unexpected trimmed duration: %.3f", duration)
	}
	if err := decodeAudioToEnd(ctx, ffmpeg, trimmed); err != nil {
		t.Fatal(err)
	}
}

func TestTrimmedMP3Filename(t *testing.T) {
	if got := trimmedMP3Filename("my_song.mp3"); got != "my_song_trimmed.mp3" {
		t.Fatalf("unexpected filename: %s", got)
	}
	if got := trimmedMP3Filename("my_song_trimmed.mp3"); got != "my_song_trimmed.mp3" {
		t.Fatalf("repeated trims should not stack suffixes: %s", got)
	}
}

func TestPocketBaseRecordID(t *testing.T) {
	if !isPocketBaseRecordID("abcdefghijklmno") {
		t.Fatal("expected a valid record id")
	}
	for _, value := range []string{"short", "abcdefghijklm/", "abcdefghijklmnoo"} {
		if isPocketBaseRecordID(value) {
			t.Fatalf("expected invalid record id: %q", value)
		}
	}
}

func TestBGMTrimRequestKey(t *testing.T) {
	request := bgmTrimRequest{MediaID: "abcdefghijklmno", StartSecond: 1, EndSecond: 2, RequestID: "123e4567-e89b-12d3-a456-426614174000"}
	first := bgmTrimRequestKey(request)
	if len(first) != len("bgm-trim:")+64 {
		t.Fatalf("unexpected request key: %q", first)
	}
	request.EndSecond = 3
	if second := bgmTrimRequestKey(request); second == first {
		t.Fatal("the request key must include the selected range")
	}
	for _, value := range []string{"short", "123e4567/e89b/12d3", ""} {
		request.RequestID = value
		if got := bgmTrimRequestKey(request); got != "" {
			t.Fatalf("expected invalid request key for %q", value)
		}
	}
}
