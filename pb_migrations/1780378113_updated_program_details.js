/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("programs")

  collection.fields.add(
    new TextField({
      name: "story_detail",
      max: 5000,
    }),
    new TextField({
      name: "solution",
      max: 3000,
    }),
    new TextField({
      name: "build_notes",
      max: 3000,
    }),
    new FileField({
      name: "screenshots",
      maxSelect: 12,
      maxSize: 20971520,
      mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    }),
  )

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("programs")

  collection.fields.removeByName("story_detail")
  collection.fields.removeByName("solution")
  collection.fields.removeByName("build_notes")
  collection.fields.removeByName("screenshots")

  return app.save(collection)
})
