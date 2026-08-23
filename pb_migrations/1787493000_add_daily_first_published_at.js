/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("daily_entries")

  collection.fields.add(new DateField({
    name: "first_published_at",
  }))
  app.save(collection)

  app.db().newQuery(`
    UPDATE daily_entries
    SET first_published_at = CASE
      WHEN id = 'em7ii665284984f' THEN '2026-08-23 13:05:45.480Z'
      ELSE published_at
    END
    WHERE status = 'published' AND published_at != ''
  `).execute()
}, (app) => {
  const collection = app.findCollectionByNameOrId("daily_entries")
  const field = collection.fields.getByName("first_published_at")
  if (!field) return

  collection.fields.removeById(field.id)
  return app.save(collection)
})
