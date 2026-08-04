The home page BGM playlist is loaded from PocketBase `site_settings.bgm_playlist`.
The legacy `site_settings.bgm_audio_url` and `site_settings.bgm_audio_title` settings still mirror the latest uploaded track for compatibility.
The KST time-slot boundaries and per-track assignments are stored in `site_settings.bgm_schedule`.
Tracks without saved assignments default to every time slot, and an empty active pool falls back to the full playlist.

This folder is only for an optional local fallback MP3 if we decide to add one later.
