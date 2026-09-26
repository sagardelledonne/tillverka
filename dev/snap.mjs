/* Foto di controllo affidabili (anche della pagina intera fatta scorrere) con Chrome pilotato da Puppeteer.
   Uso: node dev/snap.mjs W,H "<url>|<out.png>" ["<url>|<out.png>" ...]
   url relativo a http://localhost:8790/ ; aggiungi "@sezione:p" in fondo per scorrere lì (es. index.html@macchina:0.35)
   oppure "@sezione" per andare all'inizio della sezione. Stampa gli errori della console di ogni pagina. */
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Chrome: variabile CHROME, altrimenti Windows o Chromium di Linux (Playwright) */
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium']
  .find((p) => existsSync(p));
/* se jsdelivr non è raggiungibile, three arriva da dev/node_modules/three (npm i --no-save three@0.170.0) */
const LOCAL_THREE = join(dirname(fileURLToPath(import.meta.url)), 'node_modules', 'three');
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
const [size, ...items] = process.argv.slice(2);
const [W, H] = size.split(',').map(Number);
const PAR = Number(process.env.PAR || 4);
const WAIT = Number(process.env.WAIT || 1500);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--ignore-gpu-blocklist']
});

async function shoot(item) {
  const [spec, out] = item.split('|');
  const [url, at] = spec.split('@');
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/KHR_parallel_shader_compile/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
  if (existsSync(LOCAL_THREE)) {
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(CDN)) return r.continue();
      const f = join(LOCAL_THREE, u.slice(CDN.length).split('?')[0]);
      if (!existsSync(f)) return r.respond({ status: 404, body: '' });
      r.respond({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: readFileSync(f) });
    });
  }
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  try {
    await page.goto('http://localhost:8790/' + url, { waitUntil: 'load', timeout: 60000 });
    if (at) {
      const [id, pv] = at.split(':');
      await page.evaluate((id, pv) => {
        const el = document.getElementById(id);
        if (!el) return;
        document.documentElement.style.scrollBehavior = 'auto';
        const top = el.getBoundingClientRect().top + scrollY;
        const p = pv == null ? 0 : Math.min(1, Math.max(0, parseFloat(pv)));
        const y = el.hasAttribute('data-pin') && pv != null ? top + (el.offsetHeight - innerHeight) * p : top;
        scrollTo(0, Math.round(y));
      }, id, pv);
    }
    /* aspetta che la scena 3D della sezione visibile sia pronta (se c'è) */
    await page.waitForFunction(() => {
      const secs = [...document.querySelectorAll('[data-stage]')].filter((s) => {
        const r = s.getBoundingClientRect();
        return r.top < innerHeight && r.bottom > 0;
      });
      return secs.every((s) => s.classList.contains('stage-ready') || s.classList.contains('no-webgl'));
    }, { timeout: 45000, polling: 250 }).catch(() => errs.push('timeout: scena non pronta'));
    await new Promise((r) => setTimeout(r, WAIT));
    await page.screenshot({ path: out });
  } catch (e) {
    errs.push('snap: ' + e.message);
  }
  await page.close();
  console.log((errs.length ? 'ERR ' : 'ok  ') + out + (errs.length ? '\n     ' + errs.slice(0, 6).join('\n     ') : ''));
}

const queue = [...items];
await Promise.all(Array.from({ length: PAR }, async () => { while (queue.length) await shoot(queue.shift()); }));
await browser.close();
