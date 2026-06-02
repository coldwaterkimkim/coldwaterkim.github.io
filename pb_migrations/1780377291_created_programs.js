/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "programs",
    listRule: "is_public = true || @request.auth.id != ''",
    viewRule: "is_public = true || @request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
    fields: [
      {
        name: "title",
        type: "text",
        required: true,
        min: 1,
        max: 160,
      },
      {
        name: "slug",
        type: "text",
        required: true,
        min: 1,
        max: 120,
        pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
      },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["released", "beta", "prototype", "unreleased", "archived"],
      },
      {
        name: "platform",
        type: "text",
        max: 160,
      },
      {
        name: "version",
        type: "text",
        max: 80,
      },
      {
        name: "status_note",
        type: "text",
        max: 160,
      },
      {
        name: "tagline",
        type: "text",
        max: 200,
      },
      {
        name: "story_intro",
        type: "text",
        max: 500,
      },
      {
        name: "why",
        type: "text",
        required: true,
        min: 1,
        max: 1200,
      },
      {
        name: "pain_point",
        type: "text",
        required: true,
        min: 1,
        max: 1200,
      },
      {
        name: "cover_image",
        type: "file",
        maxSelect: 1,
        maxSize: 20971520,
        mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
      },
      {
        name: "download_files",
        type: "file",
        maxSelect: 8,
        maxSize: 209715200,
        mimeTypes: [],
      },
      {
        name: "primary_link_label",
        type: "text",
        max: 80,
      },
      {
        name: "primary_link_url",
        type: "url",
        max: 1000,
      },
      {
        name: "external_links",
        type: "text",
        max: 2000,
      },
      {
        name: "sort_order",
        type: "number",
        min: 0,
        max: 9999,
        onlyInt: true,
      },
      {
        name: "published_at",
        type: "date",
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
      "CREATE UNIQUE INDEX `idx_programs_slug` ON `programs` (`slug`)",
      "CREATE INDEX `idx_programs_public` ON `programs` (`is_public`)",
      "CREATE INDEX `idx_programs_status` ON `programs` (`status`)",
      "CREATE INDEX `idx_programs_sort_order` ON `programs` (`sort_order`)",
      "CREATE INDEX `idx_programs_published_at` ON `programs` (`published_at`)",
    ],
  })

  app.save(collection)

  const seedPrograms = [
    {
      title: "OneCut",
      slug: "onecut",
      status: "beta",
      platform: "iOS · TestFlight · 하루 기록",
      status_note: "공개 준비",
      tagline: "a day in one frame",
      story_intro: "하루를 한 컷으로 붙잡는 앱.",
      why: "하루가 너무 쉽게 흘러가서, 최소한 한 컷만큼은 붙잡아두려고.",
      pain_point: "사진은 많은데 하루의 감정과 맥락은 흩어지는 문제.",
      sort_order: 10,
      is_public: true,
    },
    {
      title: "Doodle 돌멩",
      slug: "doodle-dolmeng",
      status: "beta",
      platform: "iOS · 위치 기반 지도 · 캠퍼스",
      status_note: "실험중",
      tagline: "campus map scribbles",
      story_intro: "캠퍼스 생활권을 낙서처럼 남기는 지도.",
      why: "장소에는 말로 설명하기 어려운 분위기와 낙서 같은 기억이 있어서.",
      pain_point: "지도는 정확하지만, 사람들이 실제로 느끼는 생활권은 너무 납작하게 보이는 문제.",
      sort_order: 20,
      is_public: true,
    },
    {
      title: "중생돌멩",
      slug: "wisdom-dolmeng",
      status: "released",
      platform: "macOS · 메뉴바 앱 · .dmg 예정",
      status_note: "파일 준비",
      tagline: "floating wisdom panel",
      story_intro: "메뉴바에서 잠깐씩 정신을 붙잡아주는 작은 앱.",
      why: "하루 중 잠깐씩 정신을 붙잡아주는 이상한 문장이 필요해서.",
      pain_point: "집중이 풀릴 때마다 거창한 앱을 여는 건 너무 큰 행동이라는 문제.",
      sort_order: 30,
      is_public: true,
    },
    {
      title: "브덤돌멩",
      slug: "quick-dump-dolmeng",
      status: "prototype",
      platform: "macOS · 빠른 메모 · GitHub 예정",
      status_note: "손보는중",
      tagline: "throw thoughts fast",
      story_intro: "생각이 지나가기 전에 아무 데나 던져놓는 메모 도구.",
      why: "생각이 지나가기 전에 어디든 빠르게 던져놓고 싶어서.",
      pain_point: "메모 앱을 고르는 순간 이미 쓰려던 말이 사라지는 문제.",
      sort_order: 40,
      is_public: true,
    },
    {
      title: "이름 미정",
      slug: "coming-soon-program",
      status: "unreleased",
      platform: "Web · 예고편 · 아직 비밀",
      status_note: "예고편",
      tagline: "unreleased trailer",
      story_intro: "아직 이름을 붙이지 않은 예고편 row.",
      why: "아직 말하면 김이 빠지는 종류의 빡침에서 시작됨.",
      pain_point: "공개 전이라 자세한 설명은 봉인. 대신 예고편 row로 먼저 입장.",
      sort_order: 50,
      is_public: true,
    },
  ]

  seedPrograms.forEach((data) => {
    const record = new Record(collection)
    Object.entries(data).forEach(([key, value]) => {
      record.set(key, value)
    })
    app.save(record)
  })
}, (app) => {
  const collection = app.findCollectionByNameOrId("programs")
  return app.delete(collection)
})
