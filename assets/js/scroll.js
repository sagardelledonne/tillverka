/* Tillverka · avanzamento delle sezioni "fissate" allo scroll.
   Una sezione [data-pin] è alta N schermi e contiene un .pin-sticky alto uno schermo:
   mentre la attraversi, p va da 0 a 1. Lo usano sia i testi (main.js) sia le scene 3D (core.js). */

const params = new URLSearchParams(location.search);
/* ?p=0.5 blocca tutte le sezioni a quel punto (serve per controllare le pose, dev/scene.html) */
const forced = params.has('p') ? Math.min(1, Math.max(0, parseFloat(params.get('p')) || 0)) : null;

export function progressOf(el) {
  if (forced !== null) return forced;
  const r = el.getBoundingClientRect();
  /* data-pin="view": sezione normale (non fissata); p va da 0 (entra dal basso) a 1 (esce dall'alto) */
  if (el.dataset.pin === 'view') {
    return Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
  }
  const span = r.height - window.innerHeight;
  if (span <= 0) return r.top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -r.top / span));
}

/* avanzamento locale dentro un intervallo [a, b] di p, già limitato a 0..1 */
export function seg(p, a, b) {
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

const pins = new Set();
let queued = false;

function tick() {
  queued = false;
  for (const el of pins) {
    const p = progressOf(el);
    if (el._p === p) continue;
    el._p = p;
    el.style.setProperty('--p', p.toFixed(4));
    el.dispatchEvent(new CustomEvent('pin:progress', { detail: p }));
  }
}

function queue() {
  if (!queued) { queued = true; requestAnimationFrame(tick); }
}

/* registra tutte le [data-pin]: aggiornano la variabile CSS --p ed emettono 'pin:progress' */
export function watchPins(root = document) {
  root.querySelectorAll('[data-pin]').forEach((el) => pins.add(el));
  if (!watchPins.bound) {
    watchPins.bound = true;
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
  }
  queue();
  return pins;
}
