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

  media.fields.add(new FileField({
    name: "web_video",
    maxSelect: 1,
    maxSize: 2147483648,
    mimeTypes: ["video/mp4"],
  }))
  media.fields.add(new FileField({
    name: "video_poster",
    maxSelect: 1,
    maxSize: 10485760,
    mimeTypes: ["image/jpeg"],
  }))
  media.fields.add(new SelectField({
    name: "video_status",
    maxSelect: 1,
    values: ["pending", "processing", "ready", "error"],
  }))
  media.fields.add(new TextField({
    name: "video_error",
    max: 500,
  }))
  media.fields.add(new NumberField({
    name: "video_attempts",
    min: 0,
    max: 3,
    onlyInt: true,
  }))

  return app.save(media)
}, (app) => {
  const media = findOptionalCollection(app, "media")
  if (!media) return

  for (const name of ["video_attempts", "video_error", "video_status", "video_poster", "web_video"]) {
    const field = media.fields.getByName(name)
    if (field) media.fields.removeById(field.id)
  }
  return app.save(media)
})
