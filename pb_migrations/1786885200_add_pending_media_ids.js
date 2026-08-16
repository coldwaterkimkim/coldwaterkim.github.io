/// <reference path="../pb_data/types.d.ts" />
const pendingMediaCollections = ["posts", "daily_entries", "programs"]

migrate((app) => {
  for (const name of pendingMediaCollections) {
    const collection = app.findCollectionByNameOrId(name)
    if (collection.fields.getByName("pending_media_ids")) continue

    collection.fields.add(new TextField({
      name: "pending_media_ids",
      max: 10000,
    }))
    app.save(collection)
  }
}, (app) => {
  for (const name of pendingMediaCollections) {
    const collection = app.findCollectionByNameOrId(name)
    const field = collection.fields.getByName("pending_media_ids")
    if (!field) continue

    collection.fields.removeById(field.id)
    app.save(collection)
  }
})
