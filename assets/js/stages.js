/* Tillverka · avvio delle scene 3D. Ogni <section data-stage="nome" data-theme="dark|light">
   viene montata quando si avvicina allo schermo (la prima subito) e spenta quando è lontana,
   così restano accese poche scene alla volta (telefoni e schede video ringraziano). */
import { mountStage } from './three/core.js';

const scenes = {
  intro: () => import('./three/intro-scene.js'),
  printer: () => import('./three/printer-scene.js'),
  anatomy: () => import('./three/anatomy-scene.js'),
  tech: () => import('./three/tech-scene.js'),
  works: () => import('./three/works-scene.js'),
  audience: () => import('./three/audience-scene.js'),
  visor: () => import('./three/visor-scene.js'),
  lab: () => import('./three/lab-scene.js')
};

async function mount(section) {
  const load = scenes[section.dataset.stage];
  const canvas = section.querySelector('canvas.stage');
  if (!load || !canvas || section._state) return;
  section._state = 'mounting';
  const stage = await mountStage({
    section,
    canvas,
    overlay: section.querySelector('.pin-sticky') || section,
    load,
    theme: section.dataset.theme || 'dark',
    exposure: parseFloat(section.dataset.exposure || '1')
  });
  section._stage = stage;
  section._state = stage ? 'live' : 'failed';
  if (stage && section._wantOff) unmount(section);
}

function unmount(section) {
  section._wantOff = true;
  if (section._state !== 'live') return;
  section._stage.destroy();
  /* un canvas che ha perso il contesto WebGL non si riusa: lo si sostituisce con uno nuovo */
  const old = section.querySelector('canvas.stage');
  old.replaceWith(old.cloneNode(false));
  section._stage = null;
  section._state = null;
}

const sections = [...document.querySelectorAll('[data-stage]')];
if (sections.length) {
  const near = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target._wantOff = false; mount(e.target); }
    });
  }, { rootMargin: '120% 0px' });
  const far = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (!e.isIntersecting) unmount(e.target); });
  }, { rootMargin: '260% 0px' });
  sections.forEach((s) => { near.observe(s); far.observe(s); });
}
