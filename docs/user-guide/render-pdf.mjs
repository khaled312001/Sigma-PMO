/**
 * Render guide.html → Sigma-PMO-User-Guide-AR.pdf (A4).
 *
 * Completeness guarantee: before printing, every screenshot whose displayed
 * height would exceed one A4 content page is sliced IN THE PAGE (canvas) into
 * equal vertical parts, each emitted as its own figure ("جزء i من n") — so no
 * image is ever cropped or cut mid-page; long content continues on the next
 * page, exactly as the guide spec requires.
 */
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
  defaultViewport: { width: 794, height: 1123 },
});
const page = await browser.newPage();
const url = 'file:///' + resolve('guide.html').replace(/\\/g, '/');
await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });

// Wait for every image to be fully decoded.
await page.evaluate(async () => {
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
});

// Slice tall screenshots into A4-fitting parts.
const sliced = await page.evaluate(async () => {
  // A4 content box ≈ 190mm wide; displayed image width ≈ 700px. We slice
  // aggressively (parts ≤ ~0.95 h/w) so a part always fits on the SAME page
  // as its section heading/callouts — no heading stranded above a full-page
  // blank, and nothing ever cropped: the next part continues on the next page.
  const MAX_RATIO = 0.95;
  let count = 0;
  for (const img of [...document.querySelectorAll('figure > img')]) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) continue;
    const ratio = h / w;
    if (ratio <= MAX_RATIO + 0.15) continue; // fits comfortably — leave as-is

    const parts = Math.ceil(ratio / MAX_RATIO);
    const partH = Math.ceil(h / parts);
    const figure = img.closest('figure');
    const caption = figure.querySelector('figcaption')?.textContent ?? '';

    const frag = document.createDocumentFragment();
    for (let i = 0; i < parts; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = Math.min(partH, h - i * partH);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, i * partH, w, canvas.height, 0, 0, w, canvas.height);

      const fig = document.createElement('figure');
      const part = document.createElement('img');
      part.src = canvas.toDataURL('image/png');
      part.style.width = '100%';
      fig.appendChild(part);
      const cap = document.createElement('figcaption');
      cap.textContent = `${caption} — جزء ${i + 1} من ${parts}`;
      fig.appendChild(cap);
      frag.appendChild(fig);
    }
    figure.replaceWith(frag);
    count += 1;
  }
  return count;
});
console.log(`sliced ${sliced} tall screenshots into page-fitting parts`);

// Let the new data-URL images decode.
await page.evaluate(async () => {
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
});

await page.pdf({
  path: 'Sigma-PMO-User-Guide-AR.pdf',
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', bottom: '16mm', left: '10mm', right: '10mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;text-align:center;font-size:9px;color:#8a93a6;font-family:Segoe UI,Tahoma,sans-serif;">' +
    'Sigma PMO — دليل الاستخدام &nbsp;·&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
console.log('PDF written: Sigma-PMO-User-Guide-AR.pdf');
await browser.close();
