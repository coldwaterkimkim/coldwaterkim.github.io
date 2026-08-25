/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("post_views")

  collection.fields.add(new SelectField({
    name: "content_kind",
    required: false,
    maxSelect: 1,
    values: ["post", "daily", "program", "nasajab"],
  }))
  collection.fields.add(new TextField({
    name: "content_key",
    required: false,
    max: 80,
  }))
  collection.fields.add(new TextField({
    name: "content_slug",
    required: false,
    max: 200,
  }))
  collection.indexes.push(
    "CREATE INDEX `idx_post_views_content_key` ON `post_views` (`content_key`)",
    "CREATE INDEX `idx_post_views_kind_key` ON `post_views` (`content_kind`, `content_key`)"
  )
  app.save(collection)

  app.db().newQuery(`
    UPDATE post_views
    SET
      content_kind = 'post',
      content_key = 'post:' || post_id,
      content_slug = post_slug
    WHERE content_key = '' OR content_key IS NULL
  `).execute()

  const saved = app.findCollectionByNameOrId("post_views")
  saved.fields.getByName("content_kind").required = true
  saved.fields.getByName("content_key").required = true
  return app.save(saved)
}, (app) => {
  const collection = app.findCollectionByNameOrId("post_views")
  app.db().newQuery(`
    DELETE FROM post_views
    WHERE content_kind != 'post'
  `).execute()

  collection.indexes = collection.indexes.filter(index => (
    !index.includes("idx_post_views_content_key")
    && !index.includes("idx_post_views_kind_key")
  ))

  for (const fieldName of ["content_kind", "content_key", "content_slug"]) {
    const field = collection.fields.getByName(fieldName)
    if (field) collection.fields.removeById(field.id)
  }

  return app.save(collection)
})
