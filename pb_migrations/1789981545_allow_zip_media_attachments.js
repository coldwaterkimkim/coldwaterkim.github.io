/// <reference path="../pb_data/types.d.ts" />
// App bundles must be zipped before uploading so their directory layout survives.
// PocketBase detects the uploaded bytes; no generic octet-stream exemption is needed.
migrate((app) => {
  const collection = app.findCollectionByNameOrId('media')
  const field = collection.fields.getByName('file')
  field.mimeTypes = Array.from(new Set([...field.mimeTypes, 'application/zip']))
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId('media')
  const field = collection.fields.getByName('file')
  field.mimeTypes = field.mimeTypes.filter(type => type !== 'application/zip')
  return app.save(collection)
})
