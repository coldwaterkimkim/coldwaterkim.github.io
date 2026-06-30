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
  if (media) {
    const mediaFile = media.fields.getByName("file")
    mediaFile.maxSize = 2147483648
    app.save(media)
  }

  const programs = findOptionalCollection(app, "programs")
  if (programs) {
    const downloadFiles = programs.fields.getByName("download_files")
    downloadFiles.maxSize = 2147483648
    app.save(programs)
  }
}, (app) => {
  const media = findOptionalCollection(app, "media")
  if (media) {
    const mediaFile = media.fields.getByName("file")
    mediaFile.maxSize = 209715200
    app.save(media)
  }

  const programs = findOptionalCollection(app, "programs")
  if (programs) {
    const downloadFiles = programs.fields.getByName("download_files")
    downloadFiles.maxSize = 209715200
    app.save(programs)
  }
})
