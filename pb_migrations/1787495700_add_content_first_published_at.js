/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  for (const collectionName of ["posts", "programs", "nasajab", "guestbook"]) {
    const collection = app.findCollectionByNameOrId(collectionName)
    collection.fields.add(new DateField({
      name: "first_published_at",
    }))
    app.save(collection)
  }

  app.db().newQuery(`
    UPDATE posts
    SET first_published_at = created
    WHERE status = 'published' AND created != '';

    UPDATE programs
    SET first_published_at = created
    WHERE is_public = TRUE AND created != '';

    UPDATE nasajab
    SET first_published_at = created
    WHERE is_public = TRUE AND created != '';

    UPDATE guestbook
    SET first_published_at = COALESCE(NULLIF(owner_replied_at, ''), NULLIF(updated, ''), created)
    WHERE TRIM(owner_reply) != '';
  `).execute()
}, (app) => {
  for (const collectionName of ["posts", "programs", "nasajab", "guestbook"]) {
    const collection = app.findCollectionByNameOrId(collectionName)
    const field = collection.fields.getByName("first_published_at")
    if (!field) continue

    collection.fields.removeById(field.id)
    app.save(collection)
  }
})
