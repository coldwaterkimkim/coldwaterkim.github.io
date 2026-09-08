# Owner core

Native iOS 17+, Swift 5.9. No third-party runtime dependencies.

- `OwnerStore` is MainActor-isolated, publishes UI state and never logs credentials. Configure `OwnerServerURL`, `AppGroupIdentifier`, and fully expanded `KeychainAccessGroup` in both targets. App Group failures are explicit; production never silently changes storage location.
- `bootstrap()` restores drafts and refreshes the Keychain token. Every extension invocation has a unique session ID persisted on its drafts. The app reconciles only sessions whose process ownership lease it can acquire; a live extension retains its own tasks. Extension bootstrap never resumes unrelated drafts. AppDelegate must forward background session events to the SAME store's `restoreBackgroundSession(identifier:completionHandler:)`. Completion waits for response persistence and scheduling of the next transfer.
- Each draft lives in its UUID folder; coordinated atomic JSON saves are shared between targets. Session-specific kernel file locks exclude concurrent app/extension ownership, including edits and imports. One transfer per draft, two HTTP connections per host. Bodies live in the shared container until acknowledged. Credentials are only in Keychain and URLSession requests.
- ImageIO imports retain the source byte-for-byte, and create orientation-correct 4096px JPEG plus 420px thumbnail on a worker task. Public derivative copies no source EXIF/GPS dictionary. Live Photo imports its still image only. Originals have server-side protected access.
- A photo UUID is the upload requestId. Draft clientRequestId is stable across create retries. Completion requires a follow-up GET matching body/category/status/media IDs. An interrupted task is resent from its file when the app reopens; byte-offset resume is not claimed. iOS force quit cancels transfers until reopened.
- Existing documents decode into a recursive JSON object, preserving legacy HTML, embeds, revision and unknown fields while editing body/category. Existing attachment rails are preserved. Conflicting web revisions remain visible errors. Editing/replacing previously uploaded attachments is not in this first version.
- A failed draft is retained. User retry reuses its IDs. Do not mutate failed payloads that may already have reached the server: create a new draft instead. No uploaded server media is deleted by local draft removal.
- DEBUG + simulator + `CWK_UI_TESTING=1` explicitly uses a test-only Application Support directory and in-memory auth, and accepts `CWK_TEST_SERVER_URL` only for HTTP 127.0.0.1. This is not a production fallback. Signing, true App Group/Keychain sharing and system background execution still require signed-device validation.

A suspended extension deliberately retains its lease until termination; the app asks the user to close the share screen before retrying. Cached extension process lifetime and OS session handoff need signed-device testing.

## Validation still required

Build/test with Xcode 15+; this host's Swift 5.1 cannot parse concurrency. Verify signed iPhone share -> app -> server, 30-image memory pressure, iCloud imports, HEIC color/orientation, screen lock, force quit/relaunch, Wi-Fi/cellular loss and duplicate replay. A successful simulator test cannot establish actual-device smoothness or background scheduling guarantees.
