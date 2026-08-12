/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "analytics_events",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id = ''",
    updateRule: null,
    deleteRule: "@request.auth.id != ''",
    fields: [
      {
        name: "event_key",
        type: "text",
        required: true,
        min: 64,
        max: 64,
        pattern: "^[a-f0-9]{64}$",
      },
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
        name: "event_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["session_start", "page_view", "webring_click", "content_continue", "guestbook_complete"],
      },
      {
        name: "page_key",
        type: "text",
        max: 240,
      },
      {
        name: "action",
        type: "select",
        maxSelect: 1,
        values: ["prev", "random", "next", "internal", "submit"],
      },
      {
        name: "target_key",
        type: "text",
        max: 240,
      },
      {
        name: "source_group",
        type: "select",
        maxSelect: 1,
        values: ["direct", "search", "chatgpt", "instagram", "social", "referral", "internal", "unknown"],
      },
      {
        name: "returning_7d",
        type: "bool",
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
      "CREATE UNIQUE INDEX `idx_analytics_events_event_key` ON `analytics_events` (`event_key`)",
      "CREATE INDEX `idx_analytics_events_session_created` ON `analytics_events` (`session_key`, `created`)",
      "CREATE INDEX `idx_analytics_events_day_type` ON `analytics_events` (`day_key`, `event_type`)",
      "CREATE INDEX `idx_analytics_events_day_source` ON `analytics_events` (`day_key`, `source_group`)",
      "CREATE INDEX `idx_analytics_events_type_page` ON `analytics_events` (`event_type`, `page_key`)",
    ],
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("analytics_events")
  return app.delete(collection)
})
