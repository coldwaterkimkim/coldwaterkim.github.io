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

  const mediaFile = media.fields.getByName("file")
  mediaFile.thumbs = ["800x0", "1600x0"]
  return app.save(media)
}, (app) => {
  const media = findOptionalCollection(app, "media")
  if (!media) return

  const mediaFile = media.fields.getByName("file")
  mediaFile.thumbs = []
  return app.save(media)
})
