/// <reference path="../pb_data/types.d.ts" />
function findOptionalCollection(app, nameOrId) {
  try {
    return app.findCollectionByNameOrId(nameOrId)
  } catch {
    return null
  }
}

function albumViewQuery() {
  return `
WITH RECURSIVE sources AS (
  SELECT
    'posts' AS source_kind,
    p.id AS source_id,
    p.slug AS source_slug,
    p.title AS source_title,
    COALESCE(NULLIF(p.published_at, ''), p.created) AS source_published_at,
    p.updated AS source_updated_at,
    p.content AS content
  FROM posts p
  WHERE p.status = 'published'

  UNION ALL

  SELECT
    'daily' AS source_kind,
    d.id AS source_id,
    d.slug AS source_slug,
    d.title AS source_title,
    COALESCE(NULLIF(d.published_at, ''), d.created) AS source_published_at,
    d.updated AS source_updated_at,
    d.content AS content
  FROM daily_entries d
  WHERE d.status = 'published'
), refs(source_kind, source_id, source_slug, source_title, source_published_at, source_updated_at, rest, media_id) AS (
  SELECT source_kind, source_id, source_slug, source_title, source_published_at, source_updated_at, content, ''
  FROM sources

  UNION ALL

  SELECT
    source_kind,
    source_id,
    source_slug,
    source_title,
    source_published_at,
    source_updated_at,
    substr(rest, instr(rest, '/api/files/') + 11),
    substr(
      substr(rest, instr(rest, '/api/files/') + 11),
      instr(substr(rest, instr(rest, '/api/files/') + 11), '/') + 1,
      instr(substr(substr(rest, instr(rest, '/api/files/') + 11), instr(substr(rest, instr(rest, '/api/files/') + 11), '/') + 1), '/') - 1
    )
  FROM refs
  WHERE instr(rest, '/api/files/') > 0
), ranked AS (
  SELECT
    refs.*,
    ROW_NUMBER() OVER (
      PARTITION BY media_id
      ORDER BY source_published_at DESC, source_updated_at DESC, source_kind, source_id
    ) AS source_rank
  FROM refs
  WHERE media_id != ''
)
SELECT
  m.id AS id,
  m.id AS media,
  m.created AS uploaded_at,
  m.file AS file,
  m.video_poster AS video_poster,
  m.video_status AS video_status,
  m.alt_text AS alt_text,
  CAST((lower(m.file) LIKE '%.mp4' OR lower(m.file) LIKE '%.mov' OR lower(m.file) LIKE '%.m4v' OR lower(m.file) LIKE '%.webm') AS BOOLEAN) AS is_video,
  ranked.source_kind,
  ranked.source_id,
  ranked.source_slug,
  ranked.source_title,
  ranked.source_published_at
FROM media m
JOIN ranked ON ranked.media_id = m.id AND ranked.source_rank = 1
WHERE lower(m.file) LIKE '%.jpg' OR lower(m.file) LIKE '%.jpeg'
  OR lower(m.file) LIKE '%.png' OR lower(m.file) LIKE '%.gif'
  OR lower(m.file) LIKE '%.webp' OR lower(m.file) LIKE '%.mp4'
  OR lower(m.file) LIKE '%.mov' OR lower(m.file) LIKE '%.m4v'
  OR lower(m.file) LIKE '%.webm'
`
}

migrate((app) => {
  const media = findOptionalCollection(app, "media")
  if (!media) return

  const mediaFile = media.fields.getByName("file")
  mediaFile.thumbs = ["400x400", "800x0", "1600x0"]

  const videoPoster = media.fields.getByName("video_poster")
  if (videoPoster) videoPoster.thumbs = ["400x400"]

  app.save(media)

  const existing = findOptionalCollection(app, "album_items")
  if (existing) app.delete(existing)

  const album = new Collection({
    type: "view",
    name: "album_items",
    listRule: "",
    viewRule: "",
  })
  album.viewQuery = albumViewQuery()

  return app.save(album)
}, (app) => {
  const album = findOptionalCollection(app, "album_items")
  if (album) app.delete(album)

  const media = findOptionalCollection(app, "media")
  if (!media) return

  const mediaFile = media.fields.getByName("file")
  mediaFile.thumbs = ["800x0", "1600x0"]

  const videoPoster = media.fields.getByName("video_poster")
  if (videoPoster) videoPoster.thumbs = []

  return app.save(media)
})
