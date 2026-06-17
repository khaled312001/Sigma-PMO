/** Capture the logged-out sign-in page (/auth) in EN + AR for the user guide. */
import puppeteer from 'puppeteer-core';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';

const b = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1.1'],
  defaultViewport: { width: 1460, height: 900, deviceScaleFactor: 1.1 },
});
const page = await b.newPage();
await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.removeItem('sigma_api_key'); });

for (const lang of ['en', 'ar']) {
  await page.evaluate((l) => { localStorage.setItem('sigma_lang', l); localStorage.setItem('sigma_theme', 'light'); }, lang);
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: `shots-guide/${lang}/auth.png`, fullPage: true });
  console.log(`shot ${lang}: auth`);
}
await b.close();
console.log('auth capture done');
