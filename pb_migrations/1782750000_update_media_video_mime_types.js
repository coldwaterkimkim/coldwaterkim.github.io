/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("media")
  const fileField = collection.fields.getByName("file")

  fileField.maxSize = 209715200
  fileField.mimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-m4v",
    "audio/mpeg",
    "audio/mp3",
    "application/pdf",
  ]

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("media")
  const fileField = collection.fields.getByName("file")

  fileField.maxSize = 104857600
  fileField.mimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/mp3",
    "application/pdf",
  ]

  return app.save(collection)
})
