import assert from 'node:assert/strict';
import {
  aboutWikiMarkupWarnings,
  aboutWikiMediaSource,
  normalizeAboutWikiSource,
  renderAboutWikiMarkup,
} from '../js/about-wiki-markup.mjs';

let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

const richSource = [
  "'''굵게''' ''기울임'' __밑줄__ ~~취소선~~",
  '',
  '[[https://example.com|외부 링크]] [[mailto:test@example.com|메일]] [[#inside|문서 안]]',
  '',
  ' * 첫 항목',
  '  * 하위 항목',
  ' * 둘째 항목',
  '',
  '> 인용문',
  '',
  "|| '''시기''' || '''내용''' ||",
  '|| 2026 || 홈페이지 ||',
  '',
  '각주가 있다.[* 각주 내용]',
  '',
  '{{{#!folding 자세히',
  '접힌 내용',
  '}}}',
].join('\n');

const richHtml = renderAboutWikiMarkup(richSource, { idPrefix: 'overview' });
check(richHtml.includes('<strong>굵게</strong>'), 'bold markup renders');
check(richHtml.includes('<em>기울임</em>'), 'italic markup renders');
check(richHtml.includes('<u>밑줄</u>'), 'underline markup renders');
check(richHtml.includes('<del>취소선</del>'), 'strikethrough markup renders');
check(richHtml.includes('target="_blank" rel="noopener noreferrer"'), 'external links are isolated');
check(richHtml.includes('href="mailto:test@example.com"'), 'mailto links are allowed');
check(renderAboutWikiMarkup('[[posts/index.html|글방]]').includes('href="posts/index.html"'), 'same-site relative links are allowed');
check(richHtml.includes('<ul>') && richHtml.includes('하위 항목'), 'nested lists render');
check(richHtml.includes('<blockquote>'), 'quotes render');
check(richHtml.includes('<th scope="col">시기</th>'), 'bold first table row becomes headers');
check(richHtml.includes('<details class="about-wiki-fold">'), 'folding markup renders as details');
check(richHtml.includes('about-footnote-overview-1'), 'footnote ids are section-scoped');

const unsafeSource = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[[javascript:alert(1)|위험 링크]]',
  '[[data:text/html,<svg onload=1>|데이터 링크]]',
  '[[//evil.example/path|프로토콜 상대 링크]]',
  '[[https://safe.example/" onmouseover="alert(1)|안전 링크]]',
].join('\n');
const unsafeHtml = renderAboutWikiMarkup(unsafeSource);
check(!unsafeHtml.includes('<script'), 'raw script tags never execute');
check(!unsafeHtml.includes('<img src=x'), 'raw image tags never execute');
check(!unsafeHtml.includes('href="javascript:'), 'javascript links are rejected');
check(!unsafeHtml.includes('href="data:'), 'data links are rejected');
check(!unsafeHtml.includes('href="//evil'), 'protocol-relative external links are rejected');
check(!/<[^>]+\sonmouseover=/.test(unsafeHtml), 'attribute injection is escaped');
check(unsafeHtml.includes('&lt;script&gt;'), 'unsafe raw HTML remains visible as text');

const malformed = renderAboutWikiMarkup("'''닫히지 않음\n{{{#!folding 미완성\n내용");
check(typeof malformed === 'string' && malformed.includes('닫히지 않음'), 'malformed markup does not throw or lose source text');
check(aboutWikiMarkupWarnings('{{{#!folding 미완성\n내용').length === 1, 'unclosed folding emits a warning');
check(normalizeAboutWikiSource('a\r\n\r\nb  \r\n') === 'a\n\nb', 'line endings and trailing spaces normalize');
const placeholderCollision = renderAboutWikiMarkup('\uE0000\uE001 사용자 입력');
check(!placeholderCollision.includes('<strong>') && placeholderCollision.includes('�0�'), 'private-use placeholder characters cannot restore renderer HTML');

const deepQuote = `${'> '.repeat(80)}깊은 인용`;
check(renderAboutWikiMarkup(deepQuote).includes('깊은 인용'), 'deep quote input is bounded and remains visible');

const nestedFolding = renderAboutWikiMarkup([
  '{{{#!folding 바깥',
  '{{{#!folding 안쪽',
  '내용',
  '}}}',
  '}}}',
].join('\n'));
check((nestedFolding.match(/<details/g) || []).length === 2, 'nested folding blocks retain both levels');
const literalCloser = renderAboutWikiMarkup('{{{\n첫 줄\n\\}}}\n끝 줄\n}}}');
check(literalCloser.includes('첫 줄\n}}}\n끝 줄'), 'escaped literal closer remains literal content');

const escapedTableCell = renderAboutWikiMarkup('|| A \\|\\| B || C ||');
check(escapedTableCell.includes('<td>A || B</td>') && escapedTableCell.includes('<td>C</td>'), 'escaped table delimiters remain inside a cell');

const imageToken = aboutWikiMediaSource({
  url: 'https://coldwaterkim.com/api/files/media/record/photo.jpg',
  name: '사진] | 이름.jpg',
  type: 'image/jpeg',
});
check(imageToken === '[[파일:https://coldwaterkim.com/api/files/media/record/photo.jpg|사진 이름.jpg]]', 'media tokens escape delimiters');
check(renderAboutWikiMarkup(imageToken).includes('<img src="https://coldwaterkim.com/api/files/media/record/photo.jpg"'), 'image tokens render safely');
check(aboutWikiMediaSource({ url: 'javascript:alert(1)', name: 'x' }) === '', 'unsafe media URLs cannot become tokens');
check(aboutWikiMediaSource({ url: 'mailto:photo.jpg', name: 'x' }) === '', 'mailto URLs cannot become media tokens');
check(!renderAboutWikiMarkup('[[파일:mailto:photo.jpg|x]]').includes('src='), 'non-web media protocols never become src attributes');

const deterministic = renderAboutWikiMarkup(richSource, { idPrefix: 'overview' });
check(deterministic === richHtml, 'the same source renders deterministically');

console.log(`About wiki markup QA passed (${assertions} assertions).`);
