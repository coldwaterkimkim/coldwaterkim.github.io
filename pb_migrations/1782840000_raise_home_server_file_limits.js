/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const media = app.findCollectionByNameOrId("media")
  const mediaFile = media.fields.getByName("file")
  mediaFile.maxSize = 2147483648
  app.save(media)

  const programs = app.findCollectionByNameOrId("programs")
  const downloadFiles = programs.fields.getByName("download_files")
  downloadFiles.maxSize = 2147483648
  app.save(programs)
}, (app) => {
  const media = app.findCollectionByNameOrId("media")
  const mediaFile = media.fields.getByName("file")
  mediaFile.maxSize = 209715200
  app.save(media)

  const programs = app.findCollectionByNameOrId("programs")
  const downloadFiles = programs.fields.getByName("download_files")
  downloadFiles.maxSize = 209715200
  app.save(programs)
})
