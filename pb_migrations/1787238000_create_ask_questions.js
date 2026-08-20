/// <reference path="../pb_data/types.d.ts" />
function askQuestionFeedQuery() {
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

migrate((app) => {
  const questions = new Collection({
    type: "base",
    name: "ask_questions",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: null,
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      {
        name: "sequence",
        type: "number",
        required: true,
        min: 1,
        onlyInt: true,
      },
      {
        name: "asker_name",
        type: "text",
        required: true,
        min: 1,
        max: 100,
      },
      {
        name: "question",
        type: "text",
        required: true,
        min: 1,
        max: 1000,
      },
      {
        name: "is_private",
        type: "bool",
      },
      {
        name: "answer",
        type: "text",
        max: 3000,
      },
      {
        name: "answered_at",
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
      "CREATE UNIQUE INDEX `idx_ask_questions_sequence` ON `ask_questions` (`sequence`)",
      "CREATE INDEX `idx_ask_questions_created` ON `ask_questions` (`created`)",
    ],
  })
  app.save(questions)

  const counters = new Collection({
    type: "base",
    name: "ask_question_counters",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        name: "key",
        type: "text",
        required: true,
        min: 1,
        max: 50,
      },
      {
        name: "value",
        type: "number",
        min: 0,
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
      "CREATE UNIQUE INDEX `idx_ask_question_counters_key` ON `ask_question_counters` (`key`)",
    ],
  })
  app.save(counters)

  const counter = new Record(counters)
  counter.set("key", "global")
  counter.set("value", 0)
  app.save(counter)

  const feed = new Collection({
    type: "view",
    name: "ask_question_feed",
    listRule: "",
    viewRule: "",
  })
  feed.viewQuery = askQuestionFeedQuery()

  return app.save(feed)
}, (app) => {
  for (const name of ["ask_question_feed", "ask_question_counters", "ask_questions"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch {
      // Allow rolling back a partially applied development migration.
    }
  }
})
