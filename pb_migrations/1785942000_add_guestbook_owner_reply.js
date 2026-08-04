/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("guestbook")

  collection.fields.add(new TextField({
    name: "owner_reply",
    max: 1000,
  }))
  collection.fields.add(new DateField({
    name: "owner_replied_at",
  }))

  collection.createRule = "@request.body.owner_reply:isset = false && @request.body.owner_replied_at:isset = false && @request.body.display_date:isset = false"
  collection.updateRule = "@request.auth.id != ''"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("guestbook")

  for (const name of ["owner_replied_at", "owner_reply"]) {
    const field = collection.fields.getByName(name)
    if (field) collection.fields.removeById(field.id)
  }

  collection.createRule = ""
  collection.updateRule = null

  return app.save(collection)
})
