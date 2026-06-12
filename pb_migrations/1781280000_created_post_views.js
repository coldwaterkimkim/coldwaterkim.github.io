/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "post_views",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "",
    updateRule: null,
    deleteRule: "@request.auth.id != ''",
    fields: [
      {
        name: "view_key",
        type: "text",
        required: true,
        min: 64,
        max: 64,
        pattern: "^[a-f0-9]{64}$",
      },
      {
        name: "post_id",
        type: "text",
        required: true,
        min: 1,
        max: 32,
      },
      {
        name: "post_slug",
        type: "text",
        max: 200,
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
      "CREATE UNIQUE INDEX `idx_post_views_view_key` ON `post_views` (`view_key`)",
      "CREATE INDEX `idx_post_views_post_id` ON `post_views` (`post_id`)",
      "CREATE INDEX `idx_post_views_post_slug` ON `post_views` (`post_slug`)",
      "CREATE INDEX `idx_post_views_day_key` ON `post_views` (`day_key`)",
    ],
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("post_views")
  return app.delete(collection)
})
