/**
 * Build the full bilingual user guide in the rich "Acceptance Guide" style —
 * cover + numbered chapters + per-page sections with a REAL platform screenshot
 * embedded under each — then render to A4 PDF, slicing tall screenshots across
 * pages so none is cropped. Reads the markdown guides + shots-guide/{en,ar}/.
 */
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const JOBS = [
  {
    md: 'Sigma-PMO-User-Guide-EN.md', out: 'Sigma-PMO-User-Guide-EN.pdf',
    lang: 'en', dir: 'ltr',
    title: 'Sigma PMO — Complete User Guide',
    en: 'Sigma PMO · AI Governance Operating System',
    sub: 'Every page of the platform, what each tool does, and how to use it — with live screenshots. Includes the Primavera & BIM features and what happens when you connect the Claude API.',
    meta: 'Edition: <b>17 June 2026</b> · Reference project: <b class="ltr">P-1000</b><br>All screenshots are live captures from the running platform.',
    capSuffix: '— live screenshot from the platform (project P-1000)',
    footer: 'Sigma PMO — User Guide',
  },
  {
    md: 'Sigma-PMO-User-Guide-AR.md', out: 'Sigma-PMO-User-Guide-AR.pdf',
    lang: 'ar', dir: 'rtl',
    title: 'منصّة سيجما PMO — دليل المستخدم الكامل',
    en: 'Sigma PMO · AI Governance Operating System',
    sub: 'كل صفحة في المنصّة، وما تفعله كل أداة، وكيفية استخدامها — مع لقطات فعلية. يشمل ميزتي بريمافيرا وBIM وما يحدث عند ربط واجهة Claude API.',
    meta: 'الإصدار: <b>17 يونيو 2026</b> · المشروع المرجعي: <b class="ltr">P-1000</b><br>جميع اللقطات مأخوذة فعلياً من المنصّة قيد التشغيل.',
    capSuffix: '— لقطة فعلية من المنصّة (مشروع P-1000)',
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
function slugOfRoute(r) {
  if (r === '/') return 'overview';
  return r.replace(/^\//, '').replace(/\//g, '-');
}
// Tip labels (EN + AR) so the tip paragraph becomes a highlighted note.
const TIP_RE = /^(Tip|نصيحة)\b/;

function mdToHtml(md, job) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] && /^#\s+/.test(lines[0])) lines.shift();
  const html = [];
  const stack = [];
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    const raw = para.join(' ');
    let h = inline(raw);
    // Label paragraph: "<strong>Label:</strong> text" → styled key/value line.
    const m = /^<strong>([^<]+?:)<\/strong>\s*([\s\S]*)$/.exec(h);
    if (m) {
      if (TIP_RE.test(m[1])) {
        html.push(`<div class="note"><b>${m[1]}</b> ${m[2]}</div>`);
      } else {
        html.push(`<p class="kv"><span class="lbl">${m[1]}</span> ${m[2]}</p>`);
      }
    } else {
      html.push(`<p>${h}</p>`);
    }
    para = [];
  };
  const closeAll = () => { while (stack.length) html.push(stack.pop().type === 'ul' ? '</ul>' : '</ol>'); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') { flushPara(); continue; }

    const h2 = /^##\s+(?:(\d+)\.\s+)?(.*)$/.exec(line);
    const h3 = /^###\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    if (line.startsWith('## ') && h2) {
      flushPara(); closeAll();
      const badge = h2[1] ? `<span class="no">${h2[1]}</span>` : '';
      html.push(`<h2>${badge}${inline(h2[2])}</h2>`);
      continue;
    }
    if (line.startsWith('### ') && h3) {
      flushPara(); closeAll();
      html.push(`<h3>${inline(h3[1])}</h3>`);
      // Inject the page screenshot if we can find its route + a captured file.
      const rm = /`(\/[^`]*)`/.exec(h3[1]);
      if (rm) {
        const slug = slugOfRoute(rm[1].split(' ')[0]);
        const rel = `shots-guide/${job.lang}/${slug}.png`;
        if (existsSync(resolve(rel))) {
          const name = h3[1].replace(/—.*$/, '').replace(/`[^`]*`/g, '').trim();
          html.push(`<figure><img src="${rel}"><figcaption>${escapeHtml(name)} ${job.capSuffix}</figcaption></figure>`);
        }
      }
      continue;
    }
    if (line.startsWith('# ') && h1) { flushPara(); closeAll(); html.push(`<h2>${inline(h1[1])}</h2>`); continue; }

    if (/^---+$/.test(line.trim())) { flushPara(); closeAll(); html.push('<hr>'); continue; }
    if (/^>\s?/.test(line)) { flushPara(); closeAll(); html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }

    const ul = /^(\s*)-\s+(.*)$/.exec(raw);
    const ol = /^(\s*)\d+\.\s+(.*)$/.exec(raw);
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      const content = ul ? ul[2] : ol[2];
      const ind = (ul ? ul[1] : ol[1]).length;
      while (stack.length && stack[stack.length - 1].indent > ind) html.push(stack.pop().type === 'ul' ? '</ul>' : '</ol>');
      if (!stack.length || stack[stack.length - 1].indent < ind) { stack.push({ type, indent: ind }); html.push(type === 'ul' ? '<ul>' : '<ol>'); }
      else if (stack[stack.length - 1].type !== type) { html.push(stack.pop().type === 'ul' ? '</ul>' : '</ol>'); stack.push({ type, indent: ind }); html.push(type === 'ul' ? '<ul>' : '<ol>'); }
      html.push(`<li>${inline(content)}</li>`);
      continue;
    }
    flushPara(); closeAll(); para.push(line.trim());
  }
  flushPara(); closeAll();
  return html.join('\n');
}

function template(job, body) {
  return `<!doctype html><html lang="${job.lang}" dir="${job.dir}"><head><meta charset="utf-8"><style>
  :root{--ink:#1c2333;--muted:#5b667d;--line:#dfe4ee;--brand:#0369a1;--brand-soft:#eff8ff;--emerald:#047857;--emerald-soft:#ecfdf5;--amber:#92600a;}
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:var(--ink);font-size:12.5px;line-height:1.8;direction:${job.dir}}
  .ltr{direction:ltr;unicode-bidi:embed}
  code{direction:ltr;unicode-bidi:embed;font-family:Consolas,monospace;background:#f1f4f9;border:1px solid var(--line);border-radius:5px;padding:1px 7px;font-size:11.5px;color:#0f3a5e;white-space:nowrap}
  .cover{page-break-after:always;min-height:96vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(180deg,#fff 0%,#eff8ff 70%,#e0f2fe 100%);border-bottom:6px solid var(--brand)}
  .cover img.logo{width:120px;height:120px;border-radius:24px;box-shadow:0 18px 40px rgba(3,105,161,.25)}
  .cover h1{font-size:30px;margin:26px 0 6px;max-width:780px;line-height:1.35}
  .cover .en{font-size:14px;color:var(--brand);font-weight:700;letter-spacing:2px;text-transform:uppercase}
  .cover p.sub{font-size:15px;color:var(--muted);max-width:680px;margin:18px auto 0}
  .cover .meta{margin-top:40px;color:var(--muted);font-size:12px}.cover .meta b{color:var(--ink)}
  main{padding:0 44px}
  h2{page-break-before:always;font-size:23px;color:var(--brand);border-bottom:3px solid var(--brand);padding:16px 0 9px;margin:0 0 16px}
  h2 .no{display:inline-block;background:var(--brand);color:#fff;border-radius:9px;padding:2px 13px;font-size:16px;margin-inline-end:12px}
  h3{font-size:16.5px;margin:26px 0 8px;color:#16314e;page-break-after:avoid}
  p{margin:6px 0}ul,ol{margin:6px 0;padding-inline-start:24px}li{margin:3px 0}
  p.kv{margin:7px 0}p.kv .lbl{font-weight:800;color:var(--brand);margin-inline-end:4px}
  figure{margin:12px 0 22px;page-break-inside:avoid}
  figure img{width:100%;border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 18px rgba(28,35,51,.10)}
  figcaption{font-size:11px;color:var(--muted);margin-top:6px;text-align:center}
  blockquote{border-inline-start:4px solid var(--brand);background:var(--brand-soft);margin:10px 0;padding:8px 14px;color:#0c4a6e;border-radius:6px}
  .note{background:#f5f7fb;border-inline-start:4px solid var(--emerald);border-radius:8px;padding:8px 14px;margin:10px 0;page-break-inside:avoid}
  hr{border:none;border-top:1px solid var(--line);margin:14px 0}
  a{color:#0369a1;text-decoration:none}
  </style></head><body>
  <div class="cover">
    <img class="logo" src="../../frontend/public/logo.png" alt="Sigma PMO">
    <div class="en">${job.en}</div>
    <h1>${job.title}</h1>
    <p class="sub">${job.sub}</p>
    <div class="meta">${job.meta}</div>
  </div>
  <main>${body}</main>
  </body></html>`;
}

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  protocolTimeout: 600000,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
  defaultViewport: { width: 794, height: 1123 },
});

for (const job of JOBS) {
  const md = await readFile(resolve(job.md), 'utf8');
  const htmlFile = `_guide-${job.lang}.html`;
  writeFileSync(htmlFile, template(job, mdToHtml(md, job)), 'utf8');

  const page = await browser.newPage();
  const url = 'file:///' + resolve(htmlFile).replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluate(async () => { await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });

  // Cap each screenshot to the TOP ~1 page (don't show the whole long scroll —
  // it would take many pages). Downscale wide captures for size/speed.
  const capped = await page.evaluate((cropLabel) => {
    const CAP = 1.22;  // max height/width shown (a touch under one A4 page so a
                       // screenshot + caption + following text pack tidily); crop the rest
    const TW = 1080;   // downscale wide captures
    let n = 0;
    for (const img of [...document.querySelectorAll('figure > img')]) {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) continue;
      const showH = Math.min(h, Math.round(w * CAP));
      const scale = Math.min(1, TW / w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(showH * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, w, showH, 0, 0, canvas.width, canvas.height);
      img.src = canvas.toDataURL('image/jpeg', 0.82);
      img.style.width = '100%';
      if (showH < h - 4) {
        const cap = img.closest('figure').querySelector('figcaption');
        if (cap) cap.textContent = `${cap.textContent} ${cropLabel}`;
        n += 1;
      }
    }
    return n;
  }, job.lang === 'ar' ? '(أعلى الصفحة)' : '(top of page)');
  console.log(`${job.lang}: capped ${capped} tall screenshots to top-of-page`);

  await page.pdf({
    path: job.out, format: 'A4', printBackground: true, timeout: 0,
    margin: { top: '14mm', bottom: '15mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-size:8px;color:#94a3b8;font-family:Segoe UI,Tahoma,sans-serif;padding:0 12mm;display:flex;justify-content:space-between"><span>${job.footer}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await page.close();
  try { unlinkSync(htmlFile); } catch { /* keep */ }
  console.log(`PDF written: ${job.out}`);
}

await browser.close();
console.log('done');
