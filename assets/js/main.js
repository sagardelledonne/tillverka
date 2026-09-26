/* Tillverka · interfaccia della pagina.
   Lingua (IT nell'HTML, EN in i18n.js), testi sincronizzati allo scroll delle sezioni fissate,
   navigazione, comparse allo scroll, galleria con inclinazione, animazioni dei servizi, modulo preventivo.
   Aiuto per le foto di controllo: ?at=intro:0.35 (sezione:avanzamento) oppure ?at=galleria. */
import { watchPins, seg } from './scroll.js';
import { en, it as itJs } from './i18n.js';

const doc = document.documentElement;
const q = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- lingua ---------- */
const LANG_KEY = 'tillverka-lang';
let lang = 'it';
const originals = new Map();   // testi italiani originali (per tornare indietro)
const attrOriginals = new Map();

const store = {
  get() { try { return localStorage.getItem(LANG_KEY); } catch (_) { return null; } },
  set(v) { try { localStorage.setItem(LANG_KEY, v); } catch (_) { /* niente memoria: pazienza */ } }
};

/* stringhe usate solo dal codice (messaggi del modulo, etichette dinamiche) */
const t = (key) => (lang === 'en' ? en[key] : itJs[key]) ?? itJs[key] ?? key;

function applyLang(next, remember = true) {
  lang = next === 'en' ? 'en' : 'it';
  doc.lang = lang;
  $$('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!originals.has(el)) originals.set(el, el.innerHTML);
    const html = lang === 'en' ? en[key] : originals.get(el);
    if (html != null && el.innerHTML !== html) el.innerHTML = html;
  });
  $$('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (!attr || !key) return;
      const id = attr;
      if (!attrOriginals.has(el)) attrOriginals.set(el, {});
      const orig = attrOriginals.get(el);
      if (!(id in orig)) orig[id] = el.getAttribute(attr);
      const val = lang === 'en' ? en[key] : orig[id];
      if (val != null) el.setAttribute(attr, val);
    });
  });
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = t('meta.title');
  const md = $('meta[name="description"]');
  if (md) md.setAttribute('content', t('meta.description'));
  splitWords();
  syncBurgerLabel();
  if (remember) store.set(lang);
  document.dispatchEvent(new CustomEvent('lang:change', { detail: lang }));
}

/* ---------- frasi che si accendono parola per parola (missione, visione) ---------- */
function splitWords() {
  $$('.statement.lit').forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.style.setProperty('--n', words.length);
    el.innerHTML = words.map((w, i) => `<span class="w" style="--i:${i}">${escapeHtml(w)}</span>`).join(' ');
  });
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- sezioni fissate: passi e etichette seguono p ---------- */
function setupPins() {
  $$('[data-pin]').forEach((section) => {
    const items = $$('.step[data-from], .callout[data-from]', section).map((el) => ({
      el, from: parseFloat(el.dataset.from), to: parseFloat(el.dataset.to), on: false, lp: -1
    }));
    const steps = items.filter((it) => it.el.classList.contains('step'));
    section.addEventListener('pin:progress', (e) => {
      const p = e.detail;
      let phase = -1;
      for (const it of items) {
        const on = p >= it.from && (p < it.to || (it.to >= 1 && p >= 1));
        if (on !== it.on) { it.on = on; it.el.classList.toggle('is-on', on); }
        /* --lp solo dove serve (passo attivo o appena uscito) */
        const lp = seg(p, it.from, it.to);
        if (on || Math.abs(lp - it.lp) > 0.02) {
          const r = Math.round(lp * 1000) / 1000;
          if (r !== it.lp) { it.lp = r; it.el.style.setProperty('--lp', r); }
        }
        if (on && steps.includes(it) && phase < 0) phase = steps.indexOf(it);
      }
      if (phase >= 0 && section.dataset.phase !== String(phase)) section.dataset.phase = phase;
      if (section.id === 'lavori') updateWorks(section, p);
      else if (section.dataset.segs) updateSegs(section, p);
    });
  });
}

/* #lavori: sfondo bianco → nero fra p 0.30 e 0.38; il tono dei testi si gira a metà */
const mixHex = (a, b, k) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(' ')})`;
};
const smooth = (x) => x * x * (3 - 2 * x);
function updateWorks(section, p) {
  const dk = smooth(seg(p, 0.30, 0.38));
  section.style.setProperty('--dk', dk.toFixed(3));
  section.style.setProperty('--bg', mixHex('#f5f5f7', '#050506', dk));
  const tone = dk > 0.5 ? 'dark' : 'light';
  if (section.dataset.tone !== tone) { section.dataset.tone = tone; navTone(); }
  const s = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
  if (section.dataset.seg !== String(s)) section.dataset.seg = s;
  section.style.setProperty('--s0', seg(p, 0, 0.34).toFixed(3));
  section.style.setProperty('--s1', seg(p, 0.34, 0.67).toFixed(3));
  section.style.setProperty('--s2', seg(p, 0.67, 1).toFixed(3));
}

/* sezioni a tre segmenti (#tecnologie, #perchi): data-segs="0.33,0.66" → data-seg e barrette --s0..--s2 */
function updateSegs(section, p) {
  if (!section._cuts) section._cuts = [0, ...section.dataset.segs.split(',').map(parseFloat), 1];
  const c = section._cuts;
  let s = 0;
  while (s < c.length - 2 && p >= c[s + 1]) s++;
  if (section.dataset.seg !== String(s)) section.dataset.seg = s;
  for (let i = 0; i < c.length - 1; i++) section.style.setProperty('--s' + i, seg(p, c[i], c[i + 1]).toFixed(3));
}

/* ---------- navigazione ---------- */
const nav = $('#nav');
const burger = $('.burger');
const menu = $('#menu');
const toned = $$('main > section[data-tone], footer[data-tone]');
const links = $$('.menu a[href^="#"]').filter((a) => !a.classList.contains('menu-cta'));
const themeMeta = $('meta[name="theme-color"]');

function sectionAt(y) {
  for (const s of toned) {
    const r = s.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) return s;
  }
  return null;
}

function navTone() {
  const s = sectionAt((nav?.offsetHeight || 52) / 2);
  if (!s || !nav) return;
  const tone = s.dataset.tone || 'dark';
  if (nav.dataset.tone !== tone) nav.dataset.tone = tone;
  if (themeMeta) themeMeta.setAttribute('content', tone === 'light' ? '#f5f5f7' : '#050506');
}

function currentLink() {
  const s = sectionAt(innerHeight * 0.45);
  /* le sezioni senza voce nel menu accendono quella più vicina per argomento */
  const alias = { anatomia: 'macchina', galleria: 'lavori', servizi: 'perchi', preventivo: '', laboratorio: 'contatti' };
  const id = s ? (s.id in alias ? alias[s.id] : s.id) : '';
  links.forEach((a) => {
    const on = a.getAttribute('href') === '#' + id;
    a.classList.toggle('is-current', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
}

let navQueued = false;
function onScroll() {
  if (navQueued) return;
  navQueued = true;
  requestAnimationFrame(() => { navQueued = false; navTone(); currentLink(); nav?.classList.toggle('scrolled', scrollY > 8); });
}

function syncBurgerLabel() {
  if (!burger) return;
  const open = nav.classList.contains('open');
  burger.setAttribute('aria-label', t(open ? 'nav.close' : 'nav.open'));
}

function setMenu(open) {
  if (!nav || !burger) return;
  nav.classList.toggle('open', open);
  doc.classList.toggle('menu-open', open);
  burger.setAttribute('aria-expanded', String(open));
  syncBurgerLabel();
  if (open) $('a', menu)?.focus({ preventScroll: true });
}

function setupNav() {
  burger?.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  menu?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); burger.focus(); }
    /* tab resta dentro al menu aperto */
    if (e.key === 'Tab' && nav.classList.contains('open')) {
      const f = [...$$('a, button', menu), burger];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)));
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
}

/* ---------- comparse allo scroll, illustrazioni animate solo se visibili ----------
   Quello che è già sullo schermo quando arrivi (ricarica, salto con #ancora o ?at=) compare subito,
   senza transizione: mai testi a metà opacità. Il resto entra con la sua transizione mentre scorri. */
let revealIo = null;
function revealInView() {
  $$('.reveal:not(.is-in), .timeline:not(.is-in)').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) {
      el.classList.add('no-anim', 'is-in');
      revealIo?.unobserve(el);
      setTimeout(() => el.classList.remove('no-anim'), 1200);
    }
  });
}
function setupReveal() {
  const els = $$('.reveal, .timeline');
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
  revealIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); revealIo.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
  els.forEach((el) => revealIo.observe(el));
  revealInView();
  addEventListener('load', revealInView);
  addEventListener('hashchange', () => requestAnimationFrame(revealInView));
  /* un salto lungo in un colpo solo (link, tasto Fine, script) conta come arrivo */
  let lastY = scrollY, rq = 0;
  addEventListener('scroll', () => {
    if (rq) return;
    rq = requestAnimationFrame(() => {
      rq = 0;
      if (Math.abs(scrollY - lastY) > innerHeight * 1.2) revealInView();
      lastY = scrollY;
    });
  }, { passive: true });

  const play = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle('is-playing', e.isIntersecting));
  }, { threshold: 0.2 });
  $$('.svc-ill').forEach((el) => play.observe(el));

  /* foto della galleria: si caricano appena la galleria si avvicina (lazy da sola a volte arriva tardi) */
  const gal = $('#galleria');
  if (gal) {
    const pre = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      $$('img[loading="lazy"]', gal).forEach((img) => { img.loading = 'eager'; });
      pre.disconnect();
    }, { rootMargin: '150% 0px' });
    pre.observe(gal);
  }
}

/* ---------- galleria: inclinazione 3D e riflesso che segue il puntatore ---------- */
function setupTilt() {
  if (!finePointer || reduceMotion) return;
  $$('.tilt').forEach((card) => {
    const media = $('.g-media', card);
    let raf = 0, ev = null;
    const apply = () => {
      raf = 0;
      const r = card.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      card.style.setProperty('--ry', ((x - 0.5) * 7).toFixed(2) + 'deg');
      card.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2) + 'deg');
      if (media) {
        const m = media.getBoundingClientRect();
        card.style.setProperty('--mx', (((ev.clientX - m.left) / m.width) * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (((ev.clientY - m.top) / m.height) * 100).toFixed(1) + '%');
      }
    };
    card.addEventListener('pointerenter', () => card.classList.add('is-tilting'));
    card.addEventListener('pointermove', (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf); raf = 0;
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg');
    });
  });
}

/* ---------- modulo preventivo: prepara il messaggio per WhatsApp o email ---------- */
const WA = '393926323799';
const MAIL = '3d@tillverka.xyz';

function setupForm() {
  const form = $('#quote-form');
  if (!form) return;
  const status = $('.f-status', form);
  const date = $('#f-date', form);
  if (date) {
    const d = new Date();
    date.min = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const fieldOf = (el) => el.closest('.field');
  const mark = (field, bad) => {
    field.classList.toggle('invalid', bad);
    $$('input, textarea, select', field).forEach((i) => {
      if (bad) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
    });
  };

  const checks = [
    ['#f-name', (f) => f.name.value.trim().length > 1],
    ['#f-email', (f) => emailOk(f.email.value.trim())],
    ['[name="who"]', (f) => !!form.querySelector('[name="who"]:checked')],
    ['[name="svc"]', () => !!form.querySelector('[name="svc"]:checked')],
    ['#f-qty', (f) => parseInt(f.qty.value, 10) >= 1],
    ['#f-desc', (f) => f.desc.value.trim().length > 3]
  ];

  const validate = () => {
    let first = null;
    for (const [sel, ok] of checks) {
      const el = $(sel, form);
      const bad = !ok(form.elements);
      mark(fieldOf(el), bad);
      if (bad && !first) first = el;
    }
    return first;
  };

  form.addEventListener('input', (e) => {
    const field = fieldOf(e.target);
    if (field?.classList.contains('invalid')) {
      const c = checks.find(([sel]) => e.target.matches(sel));
      if (c && c[1](form.elements)) mark(field, false);
    }
  });

  const labelOf = (input) => input.closest('label')?.querySelector('span')?.textContent.trim() || input.value;
  const fmtDate = (v) => { const [y, m, d] = v.split('-'); return d && m && y ? `${d}/${m}/${y}` : v; };

  const compose = () => {
    const f = form.elements;
    const who = form.querySelector('[name="who"]:checked');
    const svc = $$('[name="svc"]:checked', form).map(labelOf);
    const mat = f.material.options[f.material.selectedIndex]?.textContent.trim();
    const rows = [
      [t('msg.name'), f.name.value.trim()],
      [t('msg.company'), f.company.value.trim()],
      [t('msg.email'), f.email.value.trim()],
      [t('msg.phone'), f.phone.value.trim()],
      [t('msg.who'), who ? labelOf(who) : ''],
      [t('msg.services'), svc.join(', ')],
      [t('msg.material'), mat],
      [t('msg.qty'), f.qty.value],
      [t('msg.date'), f.date.value ? fmtDate(f.date.value) : ''],
      [t('msg.link'), f.link.value.trim()]
    ].filter(([, v]) => v);
    return [
      t('msg.hello'),
      '',
      ...rows.map(([k, v]) => `${k}: ${v}`),
      '',
      `${t('msg.project')}:`,
      f.desc.value.trim()
    ].join('\n');
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const via = e.submitter?.value || 'wa';
    const bad = validate();
    if (bad) {
      status.textContent = t('f.status.invalid');
      status.classList.add('is-bad');
      bad.focus({ preventScroll: false });
      return;
    }
    status.classList.remove('is-bad');
    const msg = compose();
    if (via === 'mail') {
      const subject = `${t('msg.subject')} · ${form.elements.name.value.trim()}`;
      location.href = `mailto:${MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
      status.textContent = t('f.status.mail');
    } else {
      const url = `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
      /* nuova scheda; se il browser la blocca, apre nella stessa */
      const w = window.open(url, '_blank');
      if (w) w.opener = null; else location.href = url;
      status.textContent = t('f.status.wa');
    }
  });
}

/* ---------- etichette dei pezzi: niente sovrapposizioni ----------
   La scena mette --x/--y (il punto sul pezzo). Qui, se due etichette si toccano, le allontaniamo in
   verticale (--dy) e il filo sottile si inclina (--len, --ang) per raggiungerle, come nelle tavole tecniche.
   Se un'etichetta uscirebbe dallo schermo, rientra (--dx) accorciando il filo. */
function setupCallouts() {
  $$('[data-pin]').forEach((section) => {
    const els = $$('.callout[data-part]', section);
    if (!els.length) return;
    const st = els.map((el) => ({ el, label: $('.c-label', el), dx: 0, dy: 0, w: 0, h: 0, key: '' }));
    let visible = false, raf = 0, last = 0, gap = 66;
    const measure = () => {
      gap = parseFloat(getComputedStyle(els[0]).getPropertyValue('--gap')) || 66;
      st.forEach((s) => { s.w = s.label?.offsetWidth || 0; s.h = s.label?.offsetHeight || 0; });
    };
    const loop = (now) => {
      raf = visible ? requestAnimationFrame(loop) : 0;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      const on = st.filter((s) => s.el.classList.contains('is-on'));
      if (!on.length) return;
      if (on.some((s) => !s.w)) measure();
      const W = section.clientWidth, run = gap - 14, edge = 12;
      for (const s of on) {
        s.x = parseFloat(s.el.style.getPropertyValue('--x'));
        s.y = parseFloat(s.el.style.getPropertyValue('--y'));
        s.left = s.el.dataset.side === 'left';
        s.x0 = s.left ? s.x - gap - s.w : s.x + gap;
        s.x1 = s.x0 + s.w;
        /* rientro dal bordo, al massimo fino a lasciare 10 px di filo */
        const over = s.left ? Math.max(0, edge - s.x0) : Math.max(0, s.x1 - (W - edge));
        s.dx = Math.min(over, run - 10) * (s.left ? 1 : -1);
        s.x0 += s.dx; s.x1 += s.dx;
        s.ty = s.y;
      }
      const placed = on.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
      /* dall'alto in basso: ogni etichetta scende sotto a quelle che incrocia in orizzontale */
      placed.sort((a, b) => a.y - b.y);
      for (let i = 0; i < placed.length; i++) {
        const a = placed[i];
        for (let j = 0; j < i; j++) {
          const b = placed[j];
          if (a.x0 < b.x1 + 6 && b.x0 < a.x1 + 6) a.ty = Math.max(a.ty, b.ty + (a.h + b.h) / 2 + 6);
        }
      }
      for (const s of placed) {
        const target = s.ty - s.y;
        s.dy = reduceMotion ? target : s.dy + (target - s.dy) * (1 - Math.exp(-10 * dt));
        if (Math.abs(s.dy - target) < 0.3) s.dy = target;
        const len = Math.hypot(run - Math.abs(s.dx), s.dy);
        const ang = Math.asin(s.dy / len) * (s.left ? -1 : 1);
        const key = `${s.dx.toFixed(1)}|${s.dy.toFixed(1)}|${gap}|${s.left}`;
        if (key !== s.key) {
          s.key = key;
          s.el.style.setProperty('--dx', s.dx.toFixed(1) + 'px');
          s.el.style.setProperty('--dy', s.dy.toFixed(1) + 'px');
          s.el.style.setProperty('--len', len.toFixed(1) + 'px');
          s.el.style.setProperty('--ang', ang.toFixed(4) + 'rad');
        }
      }
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) { last = 0; raf = requestAnimationFrame(loop); }
    }).observe(section);
    addEventListener('resize', measure);
    document.addEventListener('lang:change', () => requestAnimationFrame(measure));
  });
}

/* ---------- ?at=sezione:p per le foto di controllo ---------- */
function jumpTo() {
  const at = q.get('at');
  if (!at) return;
  const [id, pv] = at.split(':');
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + scrollY;
  let y = top;
  if (el.hasAttribute('data-pin') && pv != null) {
    const p = Math.min(1, Math.max(0, parseFloat(pv) || 0));
    y = top + (el.offsetHeight - innerHeight) * p;
  }
  scrollTo({ top: Math.round(y), behavior: 'instant' });
}

/* ---------- avvio ---------- */
function init() {
  const fromUrl = q.get('lang');
  const saved = store.get();
  const start = fromUrl === 'en' || fromUrl === 'it' ? fromUrl : saved === 'en' ? 'en' : 'it';
  applyLang(start, false);   // si memorizza solo la scelta fatta con il selettore
  setupPins();
  setupNav();
  setupReveal();
  setupTilt();
  setupForm();
  setupCallouts();
  if (q.has('at')) {
    jumpTo();
    revealInView();
    addEventListener('load', () => { jumpTo(); requestAnimationFrame(() => { jumpTo(); revealInView(); }); });
  }
  watchPins();
  doc.classList.add('ui-ready');
}

init();
