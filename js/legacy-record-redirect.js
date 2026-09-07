// Old shared URLs keep their server-rendered article and metadata for readers
// without JavaScript; interactive readers enter the unified record screen.
const status = document.getElementById('record-redirect-status');
const daily = location.pathname.startsWith('/daily/');
const collection = daily ? 'daily_entries' : 'posts';
const params = new URLSearchParams(location.search);
let anchor = '';
try { anchor = decodeURIComponent(location.hash.slice(1)); } catch { /* Invalid fragment is optional. */ }
const mediaAnchor = /^cwk-media-([a-z0-9]{15})-([a-z0-9]{15})(?:-\d+)?$/.exec(anchor);
const requestedID = mediaAnchor?.[1] || (/^daily-([a-z0-9]{15})$/.exec(anchor)?.[1]) || params.get('id');
const selector = daily ? '[data-daily-id]' : '[data-post-id]';
const attr = daily ? 'data-daily-id' : 'data-post-id';
const articles = [...document.querySelectorAll(selector)];

function enter(id) {
  const media = mediaAnchor ? `/media:${encodeURIComponent(mediaAnchor[2])}` : '';
  location.replace(`/#record/${encodeURIComponent(`${collection}:${id}`)}${media}`);
}

async function resolve() {
  if (articles.length) {
    const article = requestedID ? articles.find(item => item.getAttribute(attr) === requestedID) : articles[0];
    if (article) return enter(article.getAttribute(attr));
    // A stale anchor should not redirect to an unrelated record on that day.
    throw new Error('연결된 기록을 찾을 수 없어.');
  }
  const { pb } = await import('./pb.js');
  let slug = params.get('slug');
  let day = params.get('day');
  const pathKey = location.pathname.split('/').filter(Boolean)[1];
  if (pathKey && pathKey !== 'view.html' && pathKey !== 'index.html') {
    const key = decodeURIComponent(pathKey);
    if (daily) day = key; else slug = key;
  }
  const conditions = ["status = 'published'"];
  const values = {};
  if (slug) { conditions.push('slug = {:slug}'); values.slug = slug; }
  else if (daily && /^\d{4}-\d{2}-\d{2}$/.test(day || '')) { conditions.push('day_key = {:day}'); values.day = day; }
  else if (!requestedID) throw new Error('기록 주소를 확인해 줘.');
  if (requestedID) { conditions.push('id = {:id}'); values.id = requestedID; }
  const result = await pb.collection(collection).getList(1, 1, {
    filter: pb.filter(conditions.join(' && '), values), sort: 'published_at,created,id', fields: 'id', requestKey: null,
  });
  if (!result.items.length) throw new Error('공개된 기록을 찾을 수 없어.');
  enter(result.items[0].id);
}
resolve().catch(error => {
  if (status) {
    status.replaceChildren(document.createTextNode(`${error.message || '기록을 불러오지 못했어.'} `));
    const link = document.createElement('a'); link.href = '/'; link.textContent = '피드로 가기'; status.append(link);
  }
});
