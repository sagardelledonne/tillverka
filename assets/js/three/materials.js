/* Tillverka · materiali condivisi da tutte le scene 3D.
   Palette: argento vivo (cromo liquido), oro, bambù (legno chiaro + verde), grafite, vetro, resina cristallo.
   L'ambiente "studio" è una stanza con pannelli luminosi: è quello che si riflette nel cromo e nell'oro. */
import * as THREE from 'three';

export const COLORS = {
  ink: 0x050506,
  paper: 0xf5f5f7,
  silver: 0xf2f3f5,
  gold: 0xd9b36a,
  goldDeep: 0xa87d3a,
  bamboo: 0x9fb46a,       // verde bambù (accento)
  bambooWood: 0xd9c18d,   // legno di bambù
  graphite: 0x1c1d20,
  glow: 0xffc978          // ugello caldo / strato appena stampato
};

/* ---------- ambiente di riflessione ---------- */
function softbox(w, h, color, intensity) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  m.color.multiplyScalar(intensity);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/* theme 'dark' = sezioni nere (riflessi contrastati), 'light' = sezioni bianche (ambiente chiaro) */
export function createStudioEnv(renderer, theme = 'dark') {
  const room = new THREE.Scene();
  const wall = theme === 'light' ? 0x8d8f94 : 0x0b0b0d;
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 20),
    new THREE.MeshBasicMaterial({ color: wall, side: THREE.BackSide })
  );
  box.position.y = 3;
  room.add(box);
  if (theme === 'light') {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0xd8d9dc }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.9;
    room.add(floor);
  }
  const add = (mesh, x, y, z, lookY = 0) => {
    mesh.position.set(x, y, z);
    mesh.lookAt(0, lookY, 0);
    room.add(mesh);
  };
  // grande softbox dall'alto
  add(softbox(9, 5, 0xffffff, theme === 'light' ? 3.2 : 4.2), 0, 8.5, 0);
  // due strisce verticali ai lati: le linee lunghe nel cromo
  add(softbox(1.1, 9, 0xffffff, 5.0), -8.5, 2.5, 2);
  add(softbox(1.1, 9, 0xffffff, 4.2), 8.5, 2.5, -1.5);
  // striscia frontale bassa
  add(softbox(10, 0.6, 0xffffff, 3.0), 0, -1.2, 9);
  // pannello caldo (oro) e pannello freddo tenue: danno colore ai bordi
  add(softbox(4, 3, 0xffc98a, 2.2), -6, 1.5, -6.5);
  add(softbox(3, 3, 0xbfd3ff, 1.1), 6.5, 4, 6.5);
  // grande pannello sfumato alle spalle della camera: le facce frontali del cromo prendono un gradiente morbido
  const grad = document.createElement('canvas');
  grad.width = 4; grad.height = 256;
  const gg = grad.getContext('2d');
  const lg = gg.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.45, '#9a9a9a'); lg.addColorStop(1, '#0c0c0c');
  gg.fillStyle = lg; gg.fillRect(0, 0, 4, 256);
  const gradTex = new THREE.CanvasTexture(grad);
  gradTex.colorSpace = THREE.SRGBColorSpace;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(14, 7),
    new THREE.MeshBasicMaterial({ map: gradTex, side: THREE.DoubleSide }));
  front.material.color.setScalar(theme === 'light' ? 1.6 : 1.25);
  add(front, 0, 3.2, 9.6, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(room, 0.035).texture;
  pmrem.dispose();
  room.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  gradTex.dispose();
  return tex;
}

/* ---------- texture procedurali ---------- */
function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* venatura del bambù pressato: fibre sottili + nodi */
export function bambooTexture() {
  const t = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#d8bf8a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * h;
      const a = 0.05 + Math.random() * 0.12;
      g.strokeStyle = Math.random() < 0.5 ? `rgba(150,112,60,${a})` : `rgba(255,240,205,${a})`;
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 6, w * 0.7, y + (Math.random() - 0.5) * 6, w, y + (Math.random() - 0.5) * 4);
      g.stroke();
    }
    for (let i = 0; i < 7; i++) {      // nodi
      const x = (i + Math.random() * 0.6) * (w / 7);
      g.fillStyle = 'rgba(120,86,40,0.22)';
      g.fillRect(x, 0, 3 + Math.random() * 3, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* righe orizzontali degli strati di stampa (per bumpMap / roughnessMap) */
export function layerLinesTexture(lines = 128) {
  const t = canvasTexture(4, 512, (g, w, h) => {
    const step = h / lines;
    for (let i = 0; i < lines; i++) {
      const grd = g.createLinearGradient(0, i * step, 0, (i + 1) * step);
      grd.addColorStop(0, '#fff');
      grd.addColorStop(0.55, '#bdbdbd');
      grd.addColorStop(1, '#6a6a6a');
      g.fillStyle = grd;
      g.fillRect(0, i * step, w, step);
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* alone morbido radiale (pozza di luce a terra, bagliori) */
export function radialTexture(stops) {
  return canvasTexture(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });
}

/* ---------- materiali ---------- */
export const mat = {
  /* argento vivo: cromo liquido, quasi specchio */
  liquidSilver: (o = {}) => new THREE.MeshPhysicalMaterial({
    color: COLORS.silver, metalness: 1, roughness: 0.07,
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25, ...o
  }),
  /* argento satinato (alluminio spazzolato, PLA alluminio) */
  satinSilver: (o = {}) => new THREE.MeshPhysicalMaterial({
    color: 0xc9ccd2, metalness: 1, roughness: 0.32, envMapIntensity: 1.0, ...o
  }),
  gold: (o = {}) => new THREE.MeshPhysicalMaterial({
    color: COLORS.gold, metalness: 1, roughness: 0.16,
    clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 1.3, ...o
  }),
  bambooWood: (o = {}) => {
    const map = bambooTexture();
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map, roughness: 0.48, metalness: 0,
      clearcoat: 0.55, clearcoatRoughness: 0.25, sheen: 0.2, envMapIntensity: 0.8, ...o
    });
  },
  bambooGreen: (o = {}) => new THREE.MeshPhysicalMaterial({
    color: COLORS.bamboo, roughness: 0.38, metalness: 0.05, clearcoat: 0.4, envMapIntensity: 0.9, ...o
  }),
  graphite: (o = {}) => new THREE.MeshPhysicalMaterial({
    color: COLORS.graphite, metalness: 0.55, roughness: 0.38, clearcoat: 0.3, envMapIntensity: 0.9, ...o
  }),
  /* plastica tecnica opaca (scocche, cover) */
  matte: (color = 0x2a2b2f, o = {}) => new THREE.MeshPhysicalMaterial({
    color, metalness: 0, roughness: 0.62, envMapIntensity: 0.7, ...o
  }),
  /* vetro economico per pannelli (niente transmission: costa poco) */
  glass: (o = {}) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16,
    envMapIntensity: 1.6, specularIntensity: 1, depthWrite: false, side: THREE.DoubleSide, ...o
  }),
  /* resina trasparente vera (transmission): per sculture, usare con parsimonia */
  crystalResin: (o = {}) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.35, ior: 1.52,
    dispersion: 0.6, attenuationColor: new THREE.Color(0xeef4ff), attenuationDistance: 2.5,
    envMapIntensity: 1.4, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, ...o
  }),
  /* ugello caldo / strato fuso: non subisce il tone mapping, "brilla" */
  glow: (color = COLORS.glow, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o })
};
