/**
 * Generic A4 HTML → PDF renderer (reuses the user-guide puppeteer/Edge setup).
 * Usage: node render-doc.mjs <input.html> <output.pdf>
 */
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [inHtml, outPdf] = process.argv.slice(2);
if (!inHtml || !outPdf) { console.error('usage: render-doc.mjs <in.html> <out.pdf>'); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
  defaultViewport: { width: 794, height: 1123 },
});
const page = await browser.newPage();
const url = 'file:///' + resolve(inHtml).replace(/\\/g, '/');
await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(async () => { await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
await page.pdf({
  path: resolve(outPdf),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: false,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
});
await browser.close();
console.log('wrote', resolve(outPdf));
