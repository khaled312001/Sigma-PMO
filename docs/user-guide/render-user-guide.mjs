/**
 * Render the bilingual user-guide markdown → PDF (A4), one file per language.
 * Self-contained: a minimal markdown→HTML converter (headings, nested lists,
 * bold/italic, inline code, links, blockquote, hr) + puppeteer-core via Edge.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const JOBS = [
  {
    md: 'Sigma-PMO-User-Guide-EN.md',
    out: 'Sigma-PMO-User-Guide-EN.pdf',
    dir: 'ltr',
    lang: 'en',
    title: 'Sigma PMO',
    subtitle: 'Complete User Guide',
    footer: 'Sigma PMO — User Guide',
  },
  {
    md: 'Sigma-PMO-User-Guide-AR.md',
    out: 'Sigma-PMO-User-Guide-AR.pdf',
    dir: 'rtl',
    lang: 'ar',
    title: 'منصّة سيجما PMO',
    subtitle: 'دليل المستخدم الكامل',
    footer: 'منصّة سيجما PMO — دليل المستخدم',
  },
];

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  s = escapeHtml(s);
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function mdToHtml(md) {
  // Drop the leading H1 (the cover shows the title instead).
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] && /^#\s+/.test(lines[0])) lines.shift();

  const html = [];
  const stack = []; // { type:'ul'|'ol', indent:number }
  let para = [];

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeAll = () => {
    while (stack.length) html.push(stack.pop().type === 'ul' ? '</ul>' : '</ol>');
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) {
      flushPara();
      closeAll();
      html.push(`<h${head[1].length}>${inline(head[2])}</h${head[1].length}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushPara();
      closeAll();
      html.push('<hr>');
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara();
      closeAll();
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    const ul = /^(\s*)-\s+(.*)$/.exec(raw);
    const ol = /^(\s*)\d+\.\s+(.*)$/.exec(raw);
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      const content = ul ? ul[2] : ol[2];
      const ind = (ul ? ul[1] : ol[1]).length;
      while (stack.length && stack[stack.length - 1].indent > ind) {
        html.push(stack.pop().type === 'ul' ? '</ul>' : '</ol>');
      }
      if (!stack.length || stack[stack.length - 1].indent < ind) {
        stack.push({ type, indent: ind });
        html.push(type === 'ul' ? '<ul>' : '<ol>');
      } else if (stack[stack.length - 1].type !== type) {
        html.push(stack.pop().type === 'ul' ? '</ul>' : '</ol>');
        stack.push({ type, indent: ind });
        html.push(type === 'ul' ? '<ul>' : '<ol>');
      }
      html.push(`<li>${inline(content)}</li>`);
      continue;
    }
    flushPara();
    closeAll();
    para.push(line.trim());
  }
  flushPara();
  closeAll();
  return html.join('\n');
}

function page(job, body) {
  return `<!doctype html>
<html lang="${job.lang}" dir="${job.dir}">
<head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #1f2937; font-size: 10.5pt; line-height: 1.65; margin: 0; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
  .cover .logo { width: 70px; height: 70px; border-radius: 16px; background: linear-gradient(135deg,#0ea5e9,#10b981); margin-bottom: 24px; }
  .cover h1 { font-size: 34pt; margin: 0 0 8px; color: #0f172a; }
  .cover .sub { font-size: 16pt; color: #0ea5e9; margin-bottom: 28px; }
  .cover .meta { font-size: 10pt; color: #64748b; }
  h1 { font-size: 20pt; color: #0f172a; }
  h2 { font-size: 16pt; color: #0369a1; border-bottom: 2px solid #e0f2fe; padding-bottom: 6px; margin-top: 26px; page-break-before: always; }
  h3 { font-size: 12.5pt; color: #0f172a; margin-top: 18px; page-break-after: avoid; }
  p { margin: 6px 0; }
  ul, ol { padding-inline-start: 1.5em; margin: 6px 0; }
  li { margin: 3px 0; }
  code { font-family: "Cascadia Code", Consolas, monospace; background: #f1f5f9; color: #0f172a; padding: 1px 5px; border-radius: 4px; font-size: 9.5pt; direction: ltr; unicode-bidi: embed; }
  strong { color: #0f172a; }
  blockquote { border-inline-start: 4px solid #0ea5e9; background: #f0f9ff; margin: 10px 0; padding: 8px 14px; color: #0c4a6e; border-radius: 4px; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
  a { color: #0369a1; text-decoration: none; }
</style></head>
<body>
  <div class="cover">
    <div class="logo"></div>
    <h1>${job.title}</h1>
    <div class="sub">${job.subtitle}</div>
    <div class="meta">${job.lang === 'ar' ? 'الإصدار 2026-06-17 · يغطّي كل صفحات المنصّة' : 'Edition 2026-06-17 · Covers every page of the platform'}</div>
  </div>
  ${body}
</body>
</html>`;
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

for (const job of JOBS) {
  const md = await readFile(resolve(job.md), 'utf8');
  const doc = page(job, mdToHtml(md));
  const p = await browser.newPage();
  await p.setContent(doc, { waitUntil: 'networkidle0' });
  await p.pdf({
    path: job.out,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      `<div style="width:100%;font-size:8px;color:#94a3b8;font-family:Segoe UI,Tahoma,sans-serif;padding:0 14mm;display:flex;justify-content:space-between;">` +
      `<span>${job.footer}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await p.close();
  console.log(`PDF written: ${job.out}`);
}

await browser.close();
console.log('done');
