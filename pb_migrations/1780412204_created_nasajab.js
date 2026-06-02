/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "nasajab",
    listRule: "is_public = true || @request.auth.id != ''",
    viewRule: "is_public = true || @request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      {
        name: "memo",
        type: "text",
        max: 600,
      },
      {
        name: "source_url",
        type: "url",
        max: 1000,
      },
      {
        name: "display_at",
        type: "date",
      },
      {
        name: "image",
        type: "file",
        required: true,
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
      },
      {
        name: "is_public",
        type: "bool",
        required: true,
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
      "CREATE INDEX `idx_nasajab_public` ON `nasajab` (`is_public`)",
      "CREATE INDEX `idx_nasajab_display_at` ON `nasajab` (`display_at`)",
    ],
  })

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("nasajab")
  return app.delete(collection)
})
