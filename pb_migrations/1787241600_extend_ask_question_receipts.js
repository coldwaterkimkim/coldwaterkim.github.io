/// <reference path="../pb_data/types.d.ts" />
function askQuestionReceiptFeedQuery() {
  return `
SELECT
  q.id AS id,
  q.sequence AS sequence,
  q.asker_name AS asker_name,
  q.created AS created,
  iif(q.is_private=TRUE,'private',iif(trim(COALESCE(q.answer,''))!='','answered','pending')) AS status,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.question,'') AS question,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.answer,'') AS answer,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.answered_at,'') AS answered_at
FROM ask_questions q
WHERE q.deleted = FALSE
`
}

function previousAskQuestionFeedQuery() {
  return `
SELECT
  q.id AS id,
  q.sequence AS sequence,
  q.asker_name AS asker_name,
  q.created AS created,
  iif(q.is_private=TRUE,'private',iif(trim(COALESCE(q.answer,''))!='','answered','pending')) AS status,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.question,'') AS question,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.answer,'') AS answer,
  iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.answered_at,'') AS answered_at
FROM ask_questions q
`
}

function recreateAskQuestionFeed(app, query) {
  const feed = new Collection({
    type: "view",
    name: "ask_question_feed",
    listRule: "",
    viewRule: "",
  })
  feed.viewQuery = query
  return app.save(feed)
}

migrate((app) => {
  const existingFeed = app.findCollectionByNameOrId("ask_question_feed")
  app.delete(existingFeed)

  const questions = app.findCollectionByNameOrId("ask_questions")
  const questionField = questions.fields.getByName("question")
  questionField.required = false
  questionField.min = 0

  questions.fields.add(new TextField({
    name: "receipt_token_hash",
    max: 64,
    pattern: "^[a-f0-9]{64}$",
    hidden: true,
  }))
  questions.fields.add(new TextField({
    name: "private_password_hash",
    max: 255,
    hidden: true,
  }))
  questions.fields.add(new BoolField({
    name: "deleted",
  }))
  questions.fields.add(new DateField({
    name: "deleted_at",
  }))
  questions.indexes.push(
    "CREATE UNIQUE INDEX `idx_ask_questions_receipt_token_hash` ON `ask_questions` (`receipt_token_hash`) WHERE `receipt_token_hash` != ''",
  )
  questions.deleteRule = null
  app.save(questions)

  return recreateAskQuestionFeed(app, askQuestionReceiptFeedQuery())
}, (app) => {
  const existingFeed = app.findCollectionByNameOrId("ask_question_feed")
  app.delete(existingFeed)

  const questions = app.findCollectionByNameOrId("ask_questions")
  const deletedRecords = app.findRecordsByFilter("ask_questions", "deleted = true", "", 0, 0)
  deletedRecords.forEach((record) => {
    if (record.getString("question") === "") {
      record.set("question", "삭제된 질문")
      app.save(record)
    }
  })

  for (const name of ["deleted_at", "deleted", "private_password_hash", "receipt_token_hash"]) {
    const field = questions.fields.getByName(name)
    if (field) questions.fields.removeById(field.id)
  }
  const questionField = questions.fields.getByName("question")
  questionField.required = true
  questionField.min = 1
  questions.indexes = questions.indexes.filter((index) => !index.includes("idx_ask_questions_receipt_token_hash"))
  questions.deleteRule = "@request.auth.id != ''"
  app.save(questions)

  return recreateAskQuestionFeed(app, previousAskQuestionFeedQuery())
})
