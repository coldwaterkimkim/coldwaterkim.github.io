/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("daily_entries")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_daily_entries_slug` ON `daily_entries` (`slug`)",
    "CREATE INDEX `idx_daily_entries_day_key` ON `daily_entries` (`day_key`)",
    "CREATE INDEX `idx_daily_entries_status` ON `daily_entries` (`status`)",
    "CREATE INDEX `idx_daily_entries_published_at` ON `daily_entries` (`published_at`)",
  ]

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("daily_entries")

  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_daily_entries_slug` ON `daily_entries` (`slug`)",
    "CREATE UNIQUE INDEX `idx_daily_entries_day_key` ON `daily_entries` (`day_key`)",
    "CREATE INDEX `idx_daily_entries_status` ON `daily_entries` (`status`)",
    "CREATE INDEX `idx_daily_entries_published_at` ON `daily_entries` (`published_at`)",
  ]

  return app.save(collection)
})
