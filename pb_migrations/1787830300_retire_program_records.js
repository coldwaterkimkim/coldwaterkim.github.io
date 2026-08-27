/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Delete through PocketBase records so program attachments are removed by the
  // normal storage lifecycle instead of leaving unreferenced files behind.
  const views = app.findRecordsByFilter("post_views", "content_kind = 'program'", "", 0, 0)
  views.forEach((record) => app.delete(record))

  const programs = app.findRecordsByFilter("programs", "", "", 0, 0)
  programs.forEach((record) => app.delete(record))
}, (_app) => {
  // Deliberately irreversible: deleted user content and attachments must never
  // be reconstructed from guesses during a migration rollback.
})
