/// <reference path="../pb_data/types.d.ts" />

function albumTagSummaryQuery() {
  return `
SELECT
  t.id AS id,
  t.name AS name,
  t.position AS position,
  t.created AS created,
  COUNT(mt.id) AS assignment_count
FROM album_tags t
LEFT JOIN album_media_tags mt ON mt.tag_id = t.id
GROUP BY t.id, t.name, t.position, t.created
`
}

function albumTaggedItemsQuery() {
  return `
SELECT
  mt.id AS id,
  ai.media AS media,
  ai.file_collection AS file_collection,
  ai.uploaded_at AS uploaded_at,
  ai.file AS file,
  ai.video_poster AS video_poster,
  ai.video_status AS video_status,
  ai.alt_text AS alt_text,
  ai.is_video AS is_video,
  ai.source_kind AS source_kind,
  ai.source_id AS source_id,
  ai.source_slug AS source_slug,
  ai.source_title AS source_title,
  ai.source_published_at AS source_published_at,
  mt.tag_id AS tag_id
FROM album_media_tags mt
JOIN album_items ai ON mt.media_key = (ai.file_collection || ':' || ai.media)
`
}

migrate((app) => {
  const tags = new Collection({
    type: "base",
    name: "album_tags",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        min: 1,
        max: 30,
      },
      {
        name: "position",
        type: "number",
        required: true,
        min: 1,
        onlyInt: true,
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
      "CREATE UNIQUE INDEX `idx_album_tags_name` ON `album_tags` (`name`)",
      "CREATE INDEX `idx_album_tags_position` ON `album_tags` (`position`, `created`)",
    ],
  })
  app.save(tags)

  const mediaTags = new Collection({
    type: "base",
    name: "album_media_tags",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        name: "media_key",
        type: "text",
        required: true,
        min: 17,
        max: 40,
        pattern: "^(media|nasajab):[a-z0-9]{15}$",
      },
      {
        name: "tag_id",
        type: "text",
        required: true,
        min: 15,
        max: 15,
        pattern: "^[a-z0-9]{15}$",
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
      "CREATE UNIQUE INDEX `idx_album_media_tags_key_tag` ON `album_media_tags` (`media_key`, `tag_id`)",
      "CREATE INDEX `idx_album_media_tags_tag` ON `album_media_tags` (`tag_id`, `created`)",
    ],
  })
  app.save(mediaTags)

  const summary = new Collection({
    type: "view",
    name: "album_tag_summary",
    listRule: "",
    viewRule: "",
  })
  summary.viewQuery = albumTagSummaryQuery()
  app.save(summary)

  const taggedItems = new Collection({
    type: "view",
    name: "album_tagged_items",
    listRule: "",
    viewRule: "",
  })
  taggedItems.viewQuery = albumTaggedItemsQuery()
  return app.save(taggedItems)
}, (app) => {
  for (const name of ["album_tagged_items", "album_tag_summary", "album_media_tags", "album_tags"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch {
      // Allow rolling back a partially applied development migration.
    }
  }
})
