/* Tillverka · motore comune delle scene 3D.
   Ogni sezione [data-stage] ha un <canvas class="stage"> dentro .pin-sticky.
   Il core crea il renderer, l'ambiente riflesso, il ciclo di disegno (solo quando la sezione è visibile),
   calcola l'avanzamento p dello scroll (grezzo e "ammorbidito") e il puntatore; la scena fa il resto.

   Una scena è un modulo con:
     export async function create(ctx) -> { scene, camera, update(state), resize?(w, h), dispose? }
   ctx   = { THREE, renderer, canvas, section, overlay, env, theme, reduceMotion, small, project }
   state = { p, pRaw, t, dt, pointer: {x, y}, w, h, aspect, small }
     p        avanzamento 0..1 ammorbidito (inerzia tipo Apple)   pRaw  quello esatto dello scroll
     t, dt    tempo in secondi dall'avvio e tra due fotogrammi
     pointer  mouse -1..1 ammorbidito (0,0 su touch o con riduzione movimento) */
import * as THREE from 'three';
import { progressOf } from '../scroll.js';
import { createStudioEnv } from './materials.js';

export { THREE };
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isSmall = () => innerWidth <= 760;

/* ---------- piccoli attrezzi di animazione ---------- */
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (p, a, b) => clamp01((p - a) / (b - a));
export const smoothstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const easeInOutCubic = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeOutBack = (x) => { x = clamp01(x); const c = 1.35; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
/* avvicinamento esponenziale indipendente dal frame rate */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
  addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = -((e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });
}

function fail(section, err) {
  section.classList.add('no-webgl');
  if (err) console.warn('[tillverka 3D]', err);
}

/* monta una scena su una sezione. load = () => import('./xxx-scene.js') */
export async function mountStage({ section, canvas, overlay, load, theme = 'dark', exposure = 1 }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    fail(section, err);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = exposure;
  const small = isSmall();
  const dpr = () => Math.min(devicePixelRatio || 1, isSmall() ? 1.5 : 2);
  renderer.setPixelRatio(dpr());

  const env = createStudioEnv(renderer, theme);
  const size = { w: 1, h: 1 };
  const v = new THREE.Vector3();
  let inst;

  /* posizione a schermo (px, relativa al canvas) di un punto 3D in coordinate mondo */
  const project = (vec3) => {
    v.copy(vec3).project(inst.camera);
    return { x: (v.x * 0.5 + 0.5) * size.w, y: (-v.y * 0.5 + 0.5) * size.h, behind: v.z > 1 };
  };

  const ctx = { THREE, renderer, canvas, section, overlay, env, theme, reduceMotion, small, project };
  try {
    const mod = await load();
    inst = await mod.create(ctx);
    if (!inst.scene.environment) inst.scene.environment = env;
  } catch (err) {
    fail(section, err);
    renderer.dispose();
    return null;
  }

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    size.w = Math.max(1, Math.round(r.width));
    size.h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(dpr());
    renderer.setSize(size.w, size.h, false);
    const cam = inst.camera;
    if (cam.isPerspectiveCamera) { cam.aspect = size.w / size.h; cam.updateProjectionMatrix(); }
    inst.resize?.(size.w, size.h);
    dirty = true;
  };

  let visible = false, running = false, dirty = true, last = 0, t = 0;
  let p = progressOf(section), lastRaw = -1;

  const frame = (now) => {
    if (!visible) { running = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const pRaw = progressOf(section);
    p = reduceMotion ? pRaw : damp(p, pRaw, 7, dt);
    if (Math.abs(p - pRaw) < 1e-4) p = pRaw;
    pointer.x = damp(pointer.x, pointer.tx, 3, dt);
    pointer.y = damp(pointer.y, pointer.ty, 3, dt);
    /* con riduzione movimento si ridisegna solo quando cambia qualcosa */
    if (reduceMotion && !dirty && pRaw === lastRaw) return;
    lastRaw = pRaw;
    dirty = false;
    t += dt;
    inst.update({ p, pRaw, t, dt, pointer: { x: pointer.x, y: pointer.y }, w: size.w, h: size.h, aspect: size.w / size.h, small: isSmall() });
    renderer.render(inst.scene, inst.camera);
  };

  const start = () => {
    if (running) return;
    running = true; last = 0;
    requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  /* compila gli shader prima del primo fotogramma: niente scatti all'ingresso */
  try {
    inst.update({ p, pRaw: p, t: 0, dt: 0.016, pointer: { x: 0, y: 0 }, w: size.w, h: size.h, aspect: size.w / size.h, small: isSmall() });
    await renderer.compileAsync(inst.scene, inst.camera);
  } catch (_) { /* non essenziale */ }
  renderer.render(inst.scene, inst.camera);
  section.classList.add('stage-ready');

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
  }, { rootMargin: '10% 0px' });
  io.observe(section);

  /* spegne la scena e libera la GPU (la usa stages.js per le sezioni lontane) */
  const destroy = () => {
    visible = false;
    io.disconnect();
    ro.disconnect();
    try { inst.dispose?.(); } catch (_) { /* niente */ }
    inst.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
    env.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    section.classList.remove('stage-ready');
  };

  return { renderer, inst, resize, destroy };
}
