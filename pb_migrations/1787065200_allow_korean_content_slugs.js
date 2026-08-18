/// <reference path="../pb_data/types.d.ts" />
const sharedSlugCollections = ["posts", "programs"]
const asciiSlugPattern = "^[a-z0-9]+(?:-[a-z0-9]+)*$"
const koreanSlugPattern = "^[a-z0-9\uac00-\ud7a3]+(?:-[a-z0-9\uac00-\ud7a3]+)*$"

function setSlugPattern(app, pattern) {
  for (const name of sharedSlugCollections) {
    const collection = app.findCollectionByNameOrId(name)
    const slug = collection.fields.getByName("slug")
    slug.pattern = pattern
    app.save(collection)
  }
}

migrate((app) => {
  setSlugPattern(app, koreanSlugPattern)
}, (app) => {
  setSlugPattern(app, asciiSlugPattern)
})
