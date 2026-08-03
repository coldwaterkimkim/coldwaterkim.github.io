/// <reference path="../pb_data/types.d.ts" />
function findOptionalCollection(app, nameOrId) {
  try {
    return app.findCollectionByNameOrId(nameOrId)
  } catch {
    return null
  }
}

migrate((app) => {
  const media = findOptionalCollection(app, "media")
  if (!media) return

  media.fields.add(new TextField({
    name: "resumable_upload_id",
    max: 512,
    hidden: true,
  }))
  media.indexes.push(
    "CREATE UNIQUE INDEX `idx_media_resumable_upload_id` ON `media` (`resumable_upload_id`) WHERE `resumable_upload_id` != ''"
  )

  return app.save(media)
}, (app) => {
  const media = findOptionalCollection(app, "media")
  if (!media) return

  media.indexes = media.indexes.filter((index) => !index.includes("idx_media_resumable_upload_id"))
  const field = media.fields.getByName("resumable_upload_id")
  if (field) media.fields.removeById(field.id)
  return app.save(media)
})
