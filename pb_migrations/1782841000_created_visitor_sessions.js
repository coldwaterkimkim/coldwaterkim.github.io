/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "visitor_sessions",
    listRule: "",
    viewRule: "",
    createRule: "",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      {
        name: "session_key",
        type: "text",
        required: true,
        min: 64,
        max: 64,
        pattern: "^[a-f0-9]{64}$",
      },
      {
        name: "day_key",
        type: "text",
        required: true,
        min: 10,
        max: 10,
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
        onUpdate: false,
      },
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_visitor_sessions_session_key` ON `visitor_sessions` (`session_key`)",
      "CREATE INDEX `idx_visitor_sessions_day_key` ON `visitor_sessions` (`day_key`)",
    ],
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("visitor_sessions")
  return app.delete(collection)
})
