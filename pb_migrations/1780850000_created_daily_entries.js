/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "daily_entries",
    listRule: "status = 'published' || @request.auth.id != ''",
    viewRule: "status = 'published' || @request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      {
        name: "title",
        type: "text",
        required: true,
        min: 1,
        max: 200,
      },
      {
        name: "slug",
        type: "text",
        required: true,
        min: 1,
        max: 200,
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
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
        name: "content",
        type: "editor",
      },
      {
        name: "excerpt",
        type: "text",
        max: 500,
      },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["draft", "published"],
      },
      {
        name: "published_at",
        type: "date",
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
      "CREATE UNIQUE INDEX `idx_daily_entries_slug` ON `daily_entries` (`slug`)",
      "CREATE UNIQUE INDEX `idx_daily_entries_day_key` ON `daily_entries` (`day_key`)",
      "CREATE INDEX `idx_daily_entries_status` ON `daily_entries` (`status`)",
      "CREATE INDEX `idx_daily_entries_published_at` ON `daily_entries` (`published_at`)",
    ],
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("daily_entries")
  return app.delete(collection)
})
