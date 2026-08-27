/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.createRule = null
  return app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  // Security invariant: rolling back unrelated schema must not reopen signup.
  users.createRule = null
  return app.save(users)
})
