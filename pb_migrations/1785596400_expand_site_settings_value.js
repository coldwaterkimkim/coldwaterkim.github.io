/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("site_settings")
  const valueField = collection.fields.getByName("value")
  valueField.max = 5000000
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("site_settings")
  const valueField = collection.fields.getByName("value")
  valueField.max = 5000
  return app.save(collection)
})
