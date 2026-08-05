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
  mediaFile.maxSize = 8589934592
  app.save(media)
}, (app) => {
  const media = findOptionalCollection(app, "media")
  if (!media) return
  const mediaFile = media.fields.getByName("file")
  mediaFile.maxSize = 2147483648
  app.save(media)
})
