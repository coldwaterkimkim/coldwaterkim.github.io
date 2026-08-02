const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const IMAGE_EXTENSION_RE = /\.(?:jpe?g|png|gif|webp)(?:[?#].*)?$/i;
const VIDEO_EXTENSION_RE = /\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i;
const AUDIO_EXTENSION_RE = /\.mp3(?:[?#].*)?$/i;
const PDF_EXTENSION_RE = /\.pdf(?:[?#].*)?$/i;

export const ABOUT_WIKI_MARKUP_VERSION = 1;

export function normalizeAboutWikiSource(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\uE000\uE001]/g, '\uFFFD')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

export function renderAboutWikiMarkup(value = '', options = {}) {
  const source = normalizeAboutWikiSource(value);
  if (!source) return '<p></p>';

  const context = {
    footnotes: [],
    headingIds: new Map(),
    idPrefix: safeId(options.idPrefix || 'section'),
  };
  const body = renderBlocks(source.split('\n'), context, 0);
  return `${body}${renderFootnotes(context)}`;
}

export function aboutWikiMediaSource({ url = '', name = '', type = '' } = {}) {
  const href = safeMediaHref(url);
  if (!href) return '';
  const label = String(name || filenameFromUrl(href) || '미디어')
    .replace(/[\]\r\n|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const mime = String(type || '').toLowerCase();

  if (mime.startsWith('image/') || IMAGE_EXTENSION_RE.test(href)) return `[[파일:${href}|${label}]]`;
  if (mime.startsWith('video/') || VIDEO_EXTENSION_RE.test(href)) return `[[파일:${href}|${label}]]`;
  if (mime.startsWith('audio/') || AUDIO_EXTENSION_RE.test(href)) return `[[파일:${href}|${label}]]`;
  if (mime === 'application/pdf' || PDF_EXTENSION_RE.test(href)) return `[[파일:${href}|${label}]]`;
  return `[[${href}|${label}]]`;
}

export function aboutWikiMarkupWarnings(value = '') {
  const source = normalizeAboutWikiSource(value);
  const warnings = [];
  const foldingStarts = (source.match(/^\{\{\{#!folding\b/gm) || []).length;
  const blockClosers = (source.match(/^\}\}\}\s*$/gm) || []).length;

  if (foldingStarts > blockClosers) {
    warnings.push('접기 문법을 닫는 }}}가 부족해.');
  }

  for (const match of source.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = match[1].replace(/^파일:/, '').trim();
    const isMedia = match[1].startsWith('파일:');
    if (!(isMedia ? safeMediaHref(target) : safeWikiHref(target))) {
      warnings.push(`허용되지 않는 링크 주소: ${target}`);
    }
  }

  return [...new Set(warnings)];
}

export function legacyHtmlToAboutWikiMarkup(value = '', ownerDocument = globalThis.document) {
  const html = String(value || '').trim();
  if (!html) return '';
  if (!ownerDocument?.createElement) return stripHtmlFallback(html);

  const template = ownerDocument.createElement('template');
  template.innerHTML = html;
  return normalizeAboutWikiSource(convertNodes([...template.content.childNodes], 0));
}

function renderBlocks(lines, context, quoteDepth = 0) {
  const html = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(line => renderInline(line, context)).join('<br>')}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      index += 1;
      continue;
    }

    const heading = line.match(/^(={2,6})\s*(.*?)\s*\1$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, heading[1].length + 1);
      const headingText = stripMarkupForLabel(heading[2]);
      const headingId = uniqueHeadingId(headingText, context);
      html.push(`<h${level} id="${escapeAttribute(headingId)}">${renderInline(heading[2], context)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^-{4,}\s*$/.test(line)) {
      flushParagraph();
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (line.trim() === '[목차]') {
      flushParagraph();
      index += 1;
      continue;
    }

    if (/^\{\{\{#!folding(?:\s|$)/.test(line)) {
      flushParagraph();
      const title = line.replace(/^\{\{\{#!folding\s*/, '').trim() || '접기';
      const collected = collectUntilClose(lines, index + 1, { nested: true });
      if (!collected.closed) {
        html.push(`<pre class="about-wiki-literal"><code>${escapeHtml([line, ...collected.lines].join('\n'))}</code></pre>`);
        index = collected.nextIndex;
        continue;
      }
      html.push(`<details class="about-wiki-fold"><summary>${renderInline(title, context)}</summary><div>${renderBlocks(collected.lines, context, quoteDepth)}</div></details>`);
      index = collected.nextIndex;
      continue;
    }

    if (line.trim() === '{{{') {
      flushParagraph();
      const collected = collectUntilClose(lines, index + 1);
      html.push(`<pre class="about-wiki-literal"><code>${escapeHtml(collected.lines.join('\n'))}</code></pre>`);
      index = collected.nextIndex;
      continue;
    }

    if (line.startsWith('||')) {
      flushParagraph();
      const tableLines = [];
      while (index < lines.length && lines[index].startsWith('||')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      html.push(renderTable(tableLines, context));
      continue;
    }

    if (/^\s+(?:\*|\d+\.)\s+/.test(line)) {
      flushParagraph();
      const listLines = [];
      while (index < lines.length && /^\s+(?:\*|\d+\.)\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      html.push(renderList(listLines, context));
      continue;
    }

    if (/^>\s?/.test(line)) {
      if (quoteDepth >= 6) {
        paragraph.push(line);
        index += 1;
        continue;
      }
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote>${renderBlocks(quoteLines, context, quoteDepth + 1)}</blockquote>`);
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return html.join('');
}

function renderInline(value, context, options = {}) {
  const placeholders = [];
  const hold = html => `\uE000${placeholders.push(html) - 1}\uE001`;
  let source = String(value || '');

  source = source.replace(/\\([\\\[\]'_~{}|])/g, (_match, literal) => hold(escapeHtml(literal)));
  source = source.replace(/\{\{\{([^\n]*?)\}\}\}/g, (_match, literal) => hold(`<code>${escapeHtml(literal)}</code>`));
  source = source.replace(/\[br\]/gi, () => hold('<br>'));

  source = source.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_match, rawTarget, rawLabel) => {
    const target = rawTarget.trim();
    if (target.startsWith('파일:')) {
      return hold(renderMedia(target.slice(3).trim(), rawLabel));
    }
    return hold(renderLink(target, rawLabel));
  });

  if (options.allowFootnotes !== false) {
    source = source.replace(/\[\*\s*([^\]]+?)\]/g, (_match, note) => {
      const number = context.footnotes.length + 1;
      context.footnotes.push(renderInline(note, context, { allowFootnotes: false }));
      return hold(`<sup class="about-wiki-footnote-ref"><a href="#about-footnote-${context.idPrefix}-${number}" id="about-footnote-ref-${context.idPrefix}-${number}" aria-label="각주 ${number}">[${number}]</a></sup>`);
    });
  }

  source = source.replace(/'''''([^'\n]+?)'''''/g, (_match, content) => hold(`<strong><em>${renderInline(content, context, { allowFootnotes: false })}</em></strong>`));
  source = source.replace(/'''([^'\n]+?)'''/g, (_match, content) => hold(`<strong>${renderInline(content, context, { allowFootnotes: false })}</strong>`));
  source = source.replace(/''([^'\n]+?)''/g, (_match, content) => hold(`<em>${renderInline(content, context, { allowFootnotes: false })}</em>`));
  source = source.replace(/__([^_\n]+?)__/g, (_match, content) => hold(`<u>${renderInline(content, context, { allowFootnotes: false })}</u>`));
  source = source.replace(/~~([^~\n]+?)~~/g, (_match, content) => hold(`<del>${renderInline(content, context, { allowFootnotes: false })}</del>`));

  let html = escapeHtml(source);
  html = html.replace(/\uE000(\d+)\uE001/g, (_match, index) => placeholders[Number(index)] || '');
  return html;
}

function renderLink(target, label) {
  const href = safeWikiHref(target);
  const text = escapeHtml(String(label || target));
  if (!href) return `<span class="about-wiki-invalid-link" title="허용되지 않는 링크">${text}</span>`;

  const external = /^(?:https?:|mailto:)/i.test(href);
  const attrs = external && !href.startsWith('mailto:')
    ? ' target="_blank" rel="noopener noreferrer"'
    : '';
    return `<a href="${escapeAttribute(href)}"${attrs}>${text}</a>`;
}

function renderMedia(target, label = '') {
  const href = safeMediaHref(target);
  const alt = String(label || filenameFromUrl(target) || '미디어').trim();
  if (!href) return `<span class="about-wiki-invalid-link">[허용되지 않는 미디어: ${escapeHtml(alt)}]</span>`;

  const safeHref = escapeAttribute(href);
  const safeAlt = escapeAttribute(alt);
  if (IMAGE_EXTENSION_RE.test(href)) {
    return `<img src="${safeHref}" alt="${safeAlt}">`;
  }
  if (VIDEO_EXTENSION_RE.test(href)) {
    return `<video src="${safeHref}" controls preload="none" playsinline aria-label="${safeAlt}"></video>`;
  }
  if (AUDIO_EXTENSION_RE.test(href)) {
    return `<audio src="${safeHref}" controls preload="none" aria-label="${safeAlt}"></audio>`;
  }
  if (PDF_EXTENSION_RE.test(href)) {
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">📄 ${escapeHtml(alt)}</a>`;
  }
  return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(alt)}</a>`;
}

function renderTable(lines, context) {
  const rows = lines.map(line => splitTableCells(line.replace(/^\|\|/, '').replace(/\|\|\s*$/, '')));
  const firstRowIsHeader = rows[0]?.length > 0 && rows[0].every(cell => /^'''[\s\S]*'''$/.test(cell));
  const body = rows.map((cells, rowIndex) => {
    const tag = firstRowIsHeader && rowIndex === 0 ? 'th' : 'td';
    const rendered = cells.map(cell => {
      const value = tag === 'th' ? cell.replace(/^'''|'''$/g, '') : cell;
      const scope = tag === 'th' ? ' scope="col"' : '';
      return `<${tag}${scope}>${renderInline(value, context)}</${tag}>`;
    }).join('');
    return `<tr>${rendered}</tr>`;
  }).join('');
  return `<div class="about-wiki-table-scroll" tabindex="0" aria-label="가로로 스크롤할 수 있는 표"><table><tbody>${body}</tbody></table></div>`;
}

function splitTableCells(value) {
  const cells = [];
  let cell = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\\' && index + 1 < value.length) {
      cell += `${value[index]}${value[index + 1]}`;
      index += 1;
      continue;
    }
    if (value[index] === '|' && value[index + 1] === '|') {
      cells.push(cell.trim());
      cell = '';
      index += 1;
      continue;
    }
    cell += value[index];
  }
  cells.push(cell.trim());
  return cells;
}

function renderList(lines, context) {
  const roots = [];
  const stack = [{ indent: -1, children: roots }];

  for (const line of lines) {
    const match = line.match(/^(\s+)(\*|\d+\.)\s+(.*)$/);
    if (!match) continue;
    const item = {
      indent: match[1].replace(/\t/g, '  ').length,
      type: match[2] === '*' ? 'ul' : 'ol',
      text: match[3],
      children: [],
    };
    while (stack.length > 1 && stack.at(-1).indent >= item.indent) stack.pop();
    stack.at(-1).children.push(item);
    stack.push(item);
  }

  return renderListNodes(roots, context);
}

function renderListNodes(nodes, context) {
  let html = '';
  for (let index = 0; index < nodes.length;) {
    const type = nodes[index].type;
    const group = [];
    while (index < nodes.length && nodes[index].type === type) {
      group.push(nodes[index]);
      index += 1;
    }
    html += `<${type}>${group.map(node => `<li>${renderInline(node.text, context)}${renderListNodes(node.children, context)}</li>`).join('')}</${type}>`;
  }
  return html;
}

function renderFootnotes(context) {
  if (!context.footnotes.length) return '';
  const items = context.footnotes.map((note, index) => {
    const number = index + 1;
    return `<li id="about-footnote-${context.idPrefix}-${number}">${note} <a href="#about-footnote-ref-${context.idPrefix}-${number}" aria-label="본문의 각주 ${number}로 돌아가기">↩</a></li>`;
  }).join('');
  return `<section class="about-wiki-footnotes" aria-label="각주"><hr><ol>${items}</ol></section>`;
}

function collectUntilClose(lines, startIndex, options = {}) {
  const collected = [];
  let index = startIndex;
  let depth = 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '\\}}}') {
      collected.push(line.replace('\\}}}', '}}}'));
      index += 1;
      continue;
    }
    if (options.nested && /^\{\{\{(?:#!folding(?:\s|$)|\s*$)/.test(line)) depth += 1;
    if (line.trim() === '}}}') {
      depth -= 1;
      if (depth === 0) {
        return { lines: collected, nextIndex: index + 1, closed: true };
      }
    }
    collected.push(line);
    index += 1;
  }
  return {
    lines: collected,
    nextIndex: index,
    closed: false,
  };
}

function safeWikiHref(value) {
  const href = String(value || '').trim();
  if (!href || /[\u0000-\u001f\u007f"'<>\[\]|]/.test(href)) return '';
  if (href.startsWith('//')) return '';
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) return href;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;

  try {
    const url = new URL(href);
    return SAFE_EXTERNAL_PROTOCOLS.has(url.protocol) ? href : '';
  } catch (_error) {
    return '';
  }
}

function safeMediaHref(value) {
  const href = safeWikiHref(value);
  if (!href || /^mailto:/i.test(href)) return '';
  return href;
}

function uniqueHeadingId(value, context) {
  const base = String(value || 'section')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
  const count = (context.headingIds.get(base) || 0) + 1;
  context.headingIds.set(base, count);
  return `about-subsection-${context.idPrefix}-${base}${count > 1 ? `-${count}` : ''}`;
}

function safeId(value) {
  return String(value || 'section')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function stripMarkupForLabel(value) {
  return String(value || '').replace(/(?:'''|''|__|~~|\[\[|\]\])/g, '').trim();
}

function filenameFromUrl(value) {
  try {
    const url = new URL(String(value || ''), 'https://coldwaterkim.com');
    return decodeURIComponent(url.pathname.split('/').pop() || '');
  } catch (_error) {
    return '';
  }
}

function convertNodes(nodes, depth) {
  return nodes.map(node => convertNode(node, depth)).join('');
}

function convertNode(node, depth) {
  if (node.nodeType === 3) return escapeWikiText(node.nodeValue || '');
  if (node.nodeType !== 1) return '';

  const tag = node.tagName.toLowerCase();
  const children = () => convertNodes([...node.childNodes], depth);
  const block = value => `${value.trim()}\n\n`;

  if (tag === 'br') return '\n';
  if (tag === 'b' || tag === 'strong') return `'''${children()}'''`;
  if (tag === 'i' || tag === 'em') return `''${children()}''`;
  if (tag === 'u') return `__${children()}__`;
  if (tag === 's' || tag === 'del' || tag === 'strike') return `~~${children()}~~`;
  if (tag === 'p' || tag === 'div') return block(children());
  if (tag === 'hr') return '\n----\n\n';
  if (tag === 'blockquote') return block(children().split('\n').filter(Boolean).map(line => `> ${line}`).join('\n'));
  if (/^h[1-6]$/.test(tag)) {
    const marker = '='.repeat(Math.min(6, Math.max(2, Number(tag.slice(1)) + 1)));
    return block(`${marker} ${children().trim()} ${marker}`);
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    const label = safeTokenLabel(children().trim() || href);
    return safeWikiHref(href) ? `[[${href}|${label}]]` : label;
  }
  if (tag === 'img' || tag === 'video' || tag === 'audio' || tag === 'iframe') {
    const src = node.getAttribute('src') || node.querySelector?.('source')?.getAttribute('src') || '';
    const label = node.getAttribute('alt') || node.getAttribute('title') || filenameFromUrl(src) || '미디어';
    return safeMediaHref(src) ? `[[파일:${src}|${safeTokenLabel(label)}]]` : '';
  }
  if (tag === 'pre') return `{{{\n${escapeLiteralBlockClosers(node.textContent || '')}\n}}}\n\n`;
  if (tag === 'code') return `{{{${String(node.textContent || '').replace(/}}}/g, '} } }')}}}`;
  if (tag === 'ul' || tag === 'ol') {
    const marker = tag === 'ul' ? '*' : '1.';
    return `${[...node.children].filter(child => child.tagName?.toLowerCase() === 'li').map(child => {
      const nestedLists = [...child.children].filter(element => ['ul', 'ol'].includes(element.tagName.toLowerCase()));
      const clone = child.cloneNode(true);
      clone.querySelectorAll('ul,ol').forEach(element => element.remove());
      const line = `${' '.repeat(depth + 1)}${marker} ${convertNodes([...clone.childNodes], depth + 1).trim()}`;
      return `${line}\n${nestedLists.map(list => convertNode(list, depth + 1)).join('')}`;
    }).join('')}\n`;
  }
  if (tag === 'table') return `${convertTableToMarkup(node)}\n\n`;
  if (tag === 'details') {
    const summary = node.querySelector(':scope > summary')?.textContent?.trim() || '접기';
    const clone = node.cloneNode(true);
    clone.querySelector(':scope > summary')?.remove();
    return `{{{#!folding ${escapeWikiText(summary)}\n${convertNodes([...clone.childNodes], depth).trim()}\n}}}\n\n`;
  }
  if (tag === 'li' || tag === 'tbody' || tag === 'thead' || tag === 'tr' || tag === 'td' || tag === 'th') return children();
  return children();
}

function convertTableToMarkup(table) {
  return [...table.querySelectorAll('tr')].map(row => {
    const cells = [...row.children].filter(cell => ['td', 'th'].includes(cell.tagName.toLowerCase()));
    return `|| ${cells.map(cell => {
      const content = convertNodes([...cell.childNodes], 0).trim().replace(/\n+/g, '[br]').replace(/\|/g, '\\|');
      return cell.tagName.toLowerCase() === 'th' ? `'''${content}'''` : content;
    }).join(' || ')} ||`;
  }).join('\n');
}

function escapeWikiText(value) {
  return String(value || '').replace(/([\\\[\]'_~{}])/g, '\\$1');
}

function safeTokenLabel(value) {
  return escapeWikiText(value).replace(/[\]|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeLiteralBlockClosers(value) {
  return String(value || '').replace(/^\s*}}}\s*$/gm, '\\}}}');
}

function stripHtmlFallback(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
