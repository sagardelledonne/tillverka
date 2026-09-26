/* Tillverka · scena "lab" (#laboratorio, sfondo nero).
   Il laboratorio in diorama isometrico low-poly (ispirato alla loro copertina Facebook, nella nostra palette):
   pavimento flottante a strati con i cavi sotto, tavoli a cavalletto in bambù, stampanti chiuse, scaffali di bobine,
   cabina di scansione con un dinosauro in wireframe, monitor, lampade, piante di bambù.
   p 0.00–0.30 entra ruotando · 0.30–0.60 esplode per strati · 0.60–0.85 si ricompone e le stampanti si accendono ·
   0.85–1.00 la camera sale in vista dall'alto. Unità: il pavimento è 4 × 3. Pavimento finito a y = 0. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seg, smoothstep, easeInOutCubic, easeOutCubic, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture, layerLinesTexture } from './materials.js';

/* ---------- misure ---------- */
const FW = 4.0, FD = 3.0;            // pavimento
const SKIN = 0.035;                  // pelle del pavimento (finitura)
const SLAB_B = -0.17;                // fondo della lastra
const GAP_B = -0.36;                 // fondo dell'intercapedine (cima della base)
const BASE_B = -0.5;
const TABLE_H = 0.4;
const GAPS = [0, 0.3, 0.34, 0.34, 0.52, 0.46, 0.46];   // spazio che si apre sotto ogni strato nell'esploso

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ---------- attrezzi ---------- */
function rbox(w, h, d, r, s = 2) {
  const m = Math.min(w, h, d) / 2 - 1e-4;
  return new RoundedBoxGeometry(w, h, d, s, Math.max(1e-4, Math.min(r, m)));
}
function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
function group(parent, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  if (parent) parent.add(g);
  return g;
}
/* InstancedMesh da una lista di trasformazioni [x, y, z, rx, ry, rz, sx, sy, sz] */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V(), _s = V();
function inst(parent, geo, material, list, colors) {
  const im = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((t, i) => {
    _p.set(t[0], t[1], t[2]);
    _q.setFromEuler(_e.set(t[3] || 0, t[4] || 0, t[5] || 0));
    _s.set(t[6] ?? 1, t[7] ?? t[6] ?? 1, t[8] ?? t[6] ?? 1);
    im.setMatrixAt(i, _m4.compose(_p, _q, _s));
    if (colors) im.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  });
  parent.add(im);
  return im;
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/* cavo: tubo lungo una polilinea con angoli arrotondati */
function cableGeo(pts, r, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), false, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(curve, Math.max(24, pts.length * 14), r, radial, false);
}

/* dinosauro low-poly (geometria unica, poi disegnata come wireframe) */
function dinoGeometry() {
  const parts = [];
  const blob = (r, detail, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.scale(sx, sy, sz);
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  const cone = (r0, r1, h, seg, x, y, z, rz, rx = 0) => {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg, 2);
    g.translate(0, h / 2, 0);
    g.rotateX(rx); g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  blob(1, 1, 0.3, 0.17, 0.15, 0, 0.44, 0, 0, 0, 0.25);        // corpo
  cone(0.13, 0.015, 0.62, 6, -0.22, 0.4, 0, 1.75);             // coda (verso -x)
  cone(0.1, 0.075, 0.2, 6, 0.2, 0.5, 0, -0.55);                // collo
  blob(1, 0, 0.14, 0.085, 0.075, 0.37, 0.64, 0, 0, 0, -0.15);  // testa
  blob(1, 0, 0.1, 0.03, 0.06, 0.4, 0.575, 0, 0, 0, -0.1);      // mandibola
  [-1, 1].forEach((s) => {
    blob(1, 0, 0.1, 0.14, 0.06, -0.02, 0.33, s * 0.1, 0, 0, 0.35);  // cosce
    cone(0.04, 0.03, 0.22, 5, 0.02, 0.06, s * 0.11, 0.15);          // stinchi
    blob(1, 0, 0.07, 0.022, 0.04, 0.06, 0.03, s * 0.11);            // piedi
    cone(0.018, 0.012, 0.1, 4, 0.22, 0.42, s * 0.07, -2.1);          // braccini
  });
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  parts.forEach((p) => p.dispose());
  return g;
}

/* ======================================================================= */
export async function create(ctx) {
  const small = ctx.small;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 120);

  scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x1a1b1f, 0.75));
  const key = new THREE.DirectionalLight(0xfff6ea, 2.0);
  key.position.set(-4, 7, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.4);
  rim.position.set(5, 4, -5);
  scene.add(rim);

  /* ---------- texture ---------- */
  const floorTex = canvasTex(1024, 768, (g, w, h) => {
    g.fillStyle = '#d7d7da'; g.fillRect(0, 0, w, h);
    const u = w / 16;                                 // piastrelle da 0,25
    g.strokeStyle = 'rgba(60,62,70,0.16)'; g.lineWidth = 2;
    for (let i = 1; i < 16; i++) { g.beginPath(); g.moveTo(i * u, 0); g.lineTo(i * u, h); g.stroke(); }
    for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(0, i * u); g.lineTo(w, i * u); g.stroke(); }
    // intarsi oro: il corridoio e le zone di lavoro (come le piastrelle colorate della copertina)
    g.fillStyle = '#d9b36a';
    const X = (x) => (x / FW + 0.5) * w, Z = (z) => (z / FD + 0.5) * h;
    g.fillRect(X(-0.6), Z(0.25) - 3, X(1.95) - X(-0.6), 6);
    g.fillRect(X(-0.6) - 3, Z(-0.9), 6, Z(0.25) - Z(-0.9));
    g.globalAlpha = 0.55;
    g.fillRect(X(-1.8), Z(0.35), X(-0.9) - X(-1.8), 8);
    g.fillRect(X(0.9), Z(-0.62), X(1.5) - X(0.9), 6);
    g.globalAlpha = 1;
    // cerchio di calibrazione della cabina di scansione
    g.strokeStyle = '#d9b36a'; g.lineWidth = 4;
    g.beginPath(); g.arc(X(-1.35), Z(-0.85), 0.52 / FW * w, 0, Math.PI * 2); g.stroke();
  });
  const screenTex = canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#0b0c0f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16181d'; g.fillRect(0, 0, 44, h); g.fillRect(0, 0, w, 16);
    g.strokeStyle = '#ecd08f'; g.lineWidth = 1.5;
    // oggetto in wireframe sullo schermo (un vaso a coste)
    for (let i = 0; i < 9; i++) {
      const y = 36 + i * 12, r = 26 + Math.sin(i * 0.7) * 10;
      g.beginPath(); g.ellipse(150, y, r, 5, 0, 0, Math.PI * 2); g.stroke();
    }
    g.strokeStyle = 'rgba(236,208,143,0.5)';
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(150 + k * 8, 36); g.lineTo(150 + k * 10, 132); g.stroke(); }
    g.fillStyle = '#9fb46a'; g.fillRect(8, 24, 28, 4); g.fillStyle = '#5a5d66';
    for (let i = 0; i < 6; i++) g.fillRect(8, 36 + i * 10, 28, 3);
    g.fillStyle = '#d9b36a'; g.fillRect(212, 140, 36, 8);
  });
  const layers = layerLinesTexture(64);
  layers.repeat.set(1, 1);
  /* ombra morbida rettangolare (sotto gli arredi: resta sul pavimento quando l'esploso li solleva) */
  const softTex = canvasTex(128, 128, (g, w, h) => {
    g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.beginPath(); g.roundRect(26, 26, w - 52, h - 52, 18); g.fill();
  });

  /* ---------- materiali ---------- */
  const M = {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78, metalness: 0, envMapIntensity: 0.6 }),
    slab: new THREE.MeshPhysicalMaterial({ color: 0x3a3c42, roughness: 0.42, metalness: 0.3, clearcoat: 0.4, envMapIntensity: 1.1, flatShading: true }),
    base: new THREE.MeshPhysicalMaterial({ color: 0x2a2b30, roughness: 0.38, metalness: 0.45, clearcoat: 0.5, envMapIntensity: 1.2, flatShading: true }),
    gold: mat.gold({ roughness: 0.22 }),
    goldFlat: mat.gold({ roughness: 0.3, flatShading: true }),
    wood: mat.bambooWood({ roughness: 0.55 }),
    green: mat.bambooGreen({ roughness: 0.5, flatShading: true }),
    silver: mat.satinSilver({ roughness: 0.3, flatShading: true }),
    chrome: mat.liquidSilver({ roughness: 0.12 }),
    dark: mat.matte(0x1b1c20, { roughness: 0.45, clearcoat: 0.3, flatShading: true }),
    black: mat.matte(0x0b0b0d, { roughness: 0.4, clearcoat: 0.4 }),
    white: mat.matte(0xe6e6e4, { roughness: 0.55, flatShading: true }),
    glass: mat.glass({ color: 0x2f3238, opacity: 0.3, envMapIntensity: 1.6 }),
    screen: new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, color: 0xcfcfcf }),
    spool: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2, clearcoat: 0.5, bumpMap: layers, bumpScale: 0.5, envMapIntensity: 0.9 }),
    flange: new THREE.MeshPhysicalMaterial({ color: 0x9aa0a8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.32, envMapIntensity: 1.4, depthWrite: false }),
    leaf: mat.bambooGreen({ roughness: 0.55, flatShading: true, color: 0x8ea85a }),
    inner: mat.glow(0x2a2620),                 // luce interna delle stampanti (si accende)
    ledOff: mat.glow(0x2a2b2f),
    scan: mat.glow(0xecd08f, { transparent: true, opacity: 0.9 }),
    lampLight: mat.glow(0xfff1d6),
    wire: new THREE.LineBasicMaterial({ color: 0xecd08f, toneMapped: false, transparent: true, opacity: 0.95 }),
    wireFill: new THREE.MeshBasicMaterial({ color: 0xecd08f, transparent: true, opacity: 0.06, depthWrite: false, toneMapped: false })
  };
  const SPOOL_COLORS = [0xe9ebee, COLORS.gold, COLORS.bamboo, 0x18191c, 0xf4f1ea, 0xc9ccd2, COLORS.goldDeep];

  const shadowMat = new THREE.MeshBasicMaterial({ map: softTex, transparent: true, opacity: 0.42, depthWrite: false, color: 0x1a1a22 });
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  blobGeo.rotateX(-Math.PI / 2);
  const blobs = [];
  /* ombra di contatto: x, z, larghezza, profondità, rotazione, quota */
  const blob = (x, z, w, d, ry = 0, y = 0.003) => blobs.push([x, y, z, 0, ry, 0, w * 1.45, 1, d * 1.45]);
  const blobsTop = [];

  const root = group(scene);      // rotazione del diorama
  const model = group(root);      // posizione (ingresso)
  const L = [];                   // strati (dal basso): base, cavi, lastra, pavimento, arredi, macchine, luci
  for (let i = 0; i < 7; i++) L.push(group(model));
  const [Lbase, Lcable, Lslab, Lfloor, Lfurn, Lmach, Llight] = L;

  /* ================= 0 · BASE con i piedini del pavimento flottante ================= */
  add(Lbase, rbox(FW - 0.08, GAP_B - BASE_B, FD - 0.08, 0.03), M.base, 0, (GAP_B + BASE_B) / 2, 0);
  add(Lbase, rbox(FW - 0.06, 0.008, FD - 0.06, 0.003), M.silver, 0, GAP_B - 0.002, 0);
  {
    const list = [];
    for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
      list.push([-FW / 2 + 0.25 + i * (FW - 0.5) / 8, (GAP_B + SLAB_B) / 2, -FD / 2 + 0.25 + j * (FD - 0.5) / 6]);
    }
    inst(Lbase, new THREE.CylinderGeometry(0.018, 0.018, SLAB_B - GAP_B, 6), M.silver, list);
    inst(Lbase, new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8), M.silver, list.map((t) => [t[0], GAP_B + 0.006, t[2]]));
  }

  /* ================= 1 · CAVI sotto la lastra ================= */
  {
    const y = (GAP_B + SLAB_B) / 2;
    const runs = [
      [[[-2.25, y - 0.02, -0.9], [-1.4, y, -0.9], [-1.2, y, -0.6], [0.4, y + 0.02, -0.6], [0.6, y, -1.0], [1.5, y, -1.0]], 0.022, M.silver],
      [[[-2.3, y - 0.05, -0.8], [-1.5, y - 0.03, -0.8], [-1.3, y - 0.03, -0.5], [1.2, y - 0.02, -0.5], [1.5, y - 0.03, 0.2], [2.3, y - 0.06, 0.2]], 0.016, M.dark],
      [[[-1.9, y + 0.03, 1.6], [-1.8, y + 0.02, 0.8], [-0.2, y + 0.03, 0.8], [0.0, y + 0.03, 0.3], [0.6, y + 0.02, 0.3], [0.8, y + 0.02, -0.4]], 0.012, M.gold],
      [[[2.25, y - 0.04, 1.1], [1.6, y - 0.01, 1.1], [1.3, y, 0.7], [-0.4, y + 0.01, 0.7], [-0.7, y, 0.1], [-1.4, y, 0.1], [-1.5, y, -0.7]], 0.014, M.green],
      [[[0.3, y - 0.05, 1.65], [0.3, y - 0.04, 0.9], [0.1, y - 0.04, 0.2], [0.1, y - 0.05, -1.0], [-0.3, y - 0.05, -1.3], [-0.9, y - 0.06, -1.65]], 0.03, M.white],
      [[[-2.3, y + 0.0, 0.5], [-1.2, y + 0.02, 0.5], [-1.0, y + 0.03, 1.2], [1.0, y + 0.03, 1.2], [1.2, y + 0.02, 1.65]], 0.018, M.silver]
    ];
    runs.forEach(([pts, r, m]) => add(Lcable, cableGeo(pts, r * 1.5, small ? 5 : 7), m));
    // canalina con coperchio
    add(Lcable, rbox(2.6, 0.05, 0.12, 0.012), M.dark, 0.1, y - 0.035, 0.05);
  }

  /* ================= 2 · LASTRA strutturale (con le righe di bordo) ================= */
  add(Lslab, rbox(FW, -SKIN - SLAB_B, FD, 0.02), M.slab, 0, (SLAB_B - SKIN) / 2, 0);
  add(Lslab, rbox(FW + 0.006, 0.01, FD + 0.006, 0.004), M.gold, 0, SLAB_B + 0.035, 0);
  add(Lslab, rbox(FW + 0.004, 0.006, FD + 0.004, 0.003), M.silver, 0, -SKIN - 0.012, 0);

  /* ================= 3 · PAVIMENTO (finitura a piastrelle con intarsi oro) ================= */
  add(Lfloor, rbox(FW, SKIN, FD, 0.012), M.floor, 0, -SKIN / 2, 0);
  {
    // la mappa sta solo sulla faccia superiore: un piano sopra, il resto del box resta color pavimento
    M.floor.map = null; M.floor.color.set(0xcfcfd2);
    const top = add(Lfloor, new THREE.PlaneGeometry(FW - 0.02, FD - 0.02), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75, envMapIntensity: 0.6 }), 0, 0.0008, 0, -Math.PI / 2);
    top.renderOrder = 1;
  }

  /* ================= 4 · ARREDI: tavoli a cavalletto, scaffali, mobile, cabina, sgabelli, piante ================= */
  const tables = [
    [-1.15, 1.02, 0, 1.35], [0.35, -0.02, 0, 1.2], [0.35, 0.5, 0, 1.2], [1.35, 1.05, 0, 1.1], [-0.75, 0.2, Math.PI / 2, 0.9]
  ];
  {
    const top = rbox(1, 0.035, 0.44, 0.012);
    const legs = [], bars = [];
    tables.forEach(([x, z, ry, len]) => {
      blob(x, z, Math.abs(Math.cos(ry)) * len + Math.abs(Math.sin(ry)) * 0.44, Math.abs(Math.sin(ry)) * len + Math.abs(Math.cos(ry)) * 0.44);
      const tg = group(Lfurn, x, 0, z, ry);
      const m = add(tg, top, M.wood, 0, TABLE_H - 0.0175, 0);
      m.scale.x = len;
      // cavalletti ad A alle due estremità (coordinate nel riferimento del tavolo)
      [-1, 1].forEach((s) => {
        const lx = s * (len / 2 - 0.13);
        const c = Math.cos(ry), sn = Math.sin(ry);
        const W2 = (dx, dz) => [x + dx * c + dz * sn, z - dx * sn + dz * c];
        [-1, 1].forEach((f) => {
          const [wx, wz] = W2(lx, f * 0.1);
          legs.push([wx, (TABLE_H - 0.035) / 2, wz, 0, ry, 0]);
          // ogni gamba a V: due aste inclinate in avanti e indietro
          legs[legs.length - 1].push(1);
        });
        const [bx, bz] = W2(lx, 0);
        bars.push([bx, TABLE_H - 0.06, bz, 0, ry, 0]);
        bars.push([bx, 0.12, bz, 0, ry, 0]);
      });
    });
    // gambe inclinate: due per piede, a V lungo la profondità del tavolo
    const legGeo = rbox(0.03, TABLE_H - 0.04, 0.03, 0.008, 1);
    const legList = [];
    legs.forEach((t) => {
      const ry = t[4];
      [-1, 1].forEach((d) => {
        const off = d * 0.045;
        legList.push([t[0] + Math.sin(ry) * 0 + Math.cos(ry) * 0, t[1], t[2], d * 0.22, ry, 0]);
        legList[legList.length - 1][0] += Math.sin(ry) * off;
        legList[legList.length - 1][2] += Math.cos(ry) * off;
      });
    });
    inst(Lfurn, legGeo, M.green, legList.map((t) => [t[0], t[1], t[2], 0, t[4], t[3]]));
    inst(Lfurn, rbox(0.03, 0.03, 0.34, 0.008, 1), M.green, bars);
  }
  // sgabelli (seduta in bambù, tre gambe argento)
  const stoolPos = [[-1.5, 1.42], [-0.85, 1.45], [0.05, -0.42], [0.65, -0.42], [0.05, 0.92], [0.65, 0.92], [1.35, 1.46], [-0.35, 0.2]];
  {
    inst(Lfurn, new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), M.wood, stoolPos.map(([x, z]) => [x, 0.26, z]));
    stoolPos.forEach(([x, z]) => blob(x, z, 0.16, 0.16));
    const legs = [];
    stoolPos.forEach(([x, z]) => { for (let k = 0; k < 3; k++) { const a = k * 2.094; legs.push([x + Math.cos(a) * 0.05, 0.125, z + Math.sin(a) * 0.05, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]); } });
    inst(Lfurn, new THREE.CylinderGeometry(0.008, 0.01, 0.25, 5), M.silver, legs);
  }
  // scaffali di bobine (telaio grafite, ripiani in bambù)
  const shelves = [];
  function shelf(x, z, ry, w = 0.85, h = 1.05, d = 0.3) {
    blob(x, z, Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d, Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d);
    const g = group(Lfurn, x, 0, z, ry);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(g, rbox(0.03, h, 0.03, 0.008, 1), M.dark, sx * (w / 2 - 0.015), h / 2, sz * (d / 2 - 0.015))));
    const levels = [0.06, 0.34, 0.62, 0.9];
    levels.forEach((y) => add(g, rbox(w, 0.025, d, 0.008, 1), M.wood, 0, y, 0));
    // bobine: in piedi, di fronte (asse lungo z)
    const n = 4, list = [], flanges = [], cols = [];
    levels.slice(0, 4).forEach((y, li) => {
      for (let i = 0; i < n; i++) {
        const px = -w / 2 + 0.11 + i * (w - 0.22) / (n - 1);
        list.push([px, y + 0.0125 + 0.1, 0, Math.PI / 2, 0, 0]);
        flanges.push([px, y + 0.0125 + 0.1, 0.045, Math.PI / 2, 0, 0], [px, y + 0.0125 + 0.1, -0.045, Math.PI / 2, 0, 0]);
        cols.push(SPOOL_COLORS[(li * 3 + i * 2 + (x > 0 ? 1 : 0)) % SPOOL_COLORS.length]);
      }
    });
    inst(g, new THREE.CylinderGeometry(0.085, 0.085, 0.08, small ? 12 : 18), M.spool, list, cols);
    inst(g, new THREE.CylinderGeometry(0.1, 0.1, 0.01, small ? 12 : 18), M.flange, flanges);
    shelves.push(g);
    return g;
  }
  shelf(-0.45, -1.22, 0);
  shelf(1.72, -0.35, -Math.PI / 2, 0.85);
  // mobile basso per le stampanti (bambù sopra, cassetti)
  blob(0.72, -1.12, 1.6, 0.5);
  blob(-1.35, -0.85, 0.96, 0.96);
  const cab = group(Lfurn, 0.72, 0, -1.12);
  add(cab, rbox(1.6, 0.3, 0.5, 0.02), M.dark, 0, 0.15, 0);
  add(cab, rbox(1.62, 0.025, 0.52, 0.008), M.wood, 0, 0.3125, 0);
  for (let i = 0; i < 4; i++) add(cab, rbox(0.34, 0.01, 0.01, 0.004, 1), M.silver, -0.6 + i * 0.4, 0.24, 0.255);
  // cabina di scansione: pedana, montanti, telaio
  const BOOTH = V(-1.35, 0, -0.85), BH = 1.3;
  const booth = group(Lfurn, BOOTH.x, 0, BOOTH.z);
  add(booth, rbox(0.96, 0.06, 0.96, 0.02), M.dark, 0, 0.03, 0);
  add(booth, rbox(0.965, 0.008, 0.965, 0.003), M.gold, 0, 0.055, 0);
  [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(booth, rbox(0.055, BH, 0.055, 0.012, 1), M.silver, sx * 0.44, BH / 2, sz * 0.44)));
  [-1, 1].forEach((s) => {
    add(booth, rbox(0.95, 0.07, 0.07, 0.015, 1), M.dark, 0, BH + 0.02, s * 0.44);
    add(booth, rbox(0.07, 0.07, 0.95, 0.015, 1), M.dark, s * 0.44, BH + 0.02, 0);
  });
  // piante di bambù in vaso
  function bambooPlant(x, z, hgt = 0.7) {
    blob(x, z, 0.2, 0.2);
    const g = group(Lfurn, x, 0, z);
    add(g, new THREE.CylinderGeometry(0.1, 0.08, 0.16, 8), M.dark, 0, 0.08, 0);
    add(g, new THREE.CylinderGeometry(0.095, 0.095, 0.01, 8), M.base, 0, 0.16, 0);
    const stalks = [[0, 0, 1], [0.04, 0.03, 0.85], [-0.035, 0.02, 0.72]];
    stalks.forEach(([sx, sz, k]) => {
      const h = hgt * k;
      add(g, new THREE.CylinderGeometry(0.012, 0.014, h, 5), M.green, sx, 0.16 + h / 2, sz, sx * 0.4, 0, -sx * 0.4);
      for (let i = 1; i < 4; i++) add(g, new THREE.CylinderGeometry(0.016, 0.016, 0.012, 5), M.leaf, sx + sx * 0.4 * (i / 4) * 0.3, 0.16 + h * i / 4, sz);
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 3), M.leaf);
        const a = i * 1.7 + k * 3;
        leaf.position.set(sx + Math.cos(a) * 0.08, 0.16 + h * (0.55 + i * 0.13), sz + Math.sin(a) * 0.08);
        leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
        leaf.scale.set(1, 1, 0.25);
        g.add(leaf);
      }
    });
    return g;
  }
  bambooPlant(-1.82, 0.35);
  bambooPlant(1.82, 1.3, 0.55);

  /* ================= 5 · MACCHINE: stampanti, monitor, piatto girevole + dinosauro ================= */
  const printers = [];
  const PW = 0.4, PH = 0.46, CAB_TOP = 0.325;
  {
    [0.2, 0.72, 1.24].forEach((x, i) => {
      const g = group(Lmach, x, CAB_TOP, -1.12);
      add(g, rbox(PW, 0.08, PW, 0.02), M.dark, 0, 0.04, 0);                           // base
      add(g, rbox(PW + 0.004, 0.006, PW + 0.004, 0.003, 1), M.silver, 0, 0.082, 0);    // filo satinato
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => add(g, rbox(0.03, PH - 0.08, 0.03, 0.008, 1), M.silver, sx * (PW / 2 - 0.015), 0.08 + (PH - 0.08) / 2, sz * (PW / 2 - 0.015))));
      add(g, rbox(PW, 0.03, PW, 0.012), M.dark, 0, PH, 0);                               // tetto
      add(g, rbox(PW - 0.03, PH - 0.1, 0.01, 0.004, 1), M.dark, 0, 0.08 + (PH - 0.1) / 2, -PW / 2 + 0.01);   // fondo
      const glassBox = add(g, new THREE.BoxGeometry(PW - 0.02, PH - 0.1, PW - 0.02), M.glass, 0, 0.08 + (PH - 0.1) / 2, 0);
      glassBox.renderOrder = 2;
      add(g, rbox(0.012, 0.16, 0.014, 0.005, 1), M.silver, PW / 2 - 0.05, 0.27, PW / 2 + 0.004);   // maniglia
      // dentro: piatto dorato, trave con testina, pezzo in stampa
      add(g, rbox(0.3, 0.012, 0.3, 0.004, 1), M.gold, 0, 0.13, 0);
      add(g, new THREE.CylinderGeometry(0.006, 0.006, 0.34, 6), M.chrome, 0, PH - 0.07, 0.02, 0, 0, Math.PI / 2);
      add(g, rbox(0.06, 0.06, 0.05, 0.01, 1), M.dark, (i - 1) * 0.05, PH - 0.08, 0.02);
      add(g, new THREE.CylinderGeometry(0.035, 0.045, 0.06 + i * 0.02, 6), [M.white, M.goldFlat, M.green][i], (i - 1) * 0.05, 0.166 + i * 0.01, 0.0);
      // luce interna: pannello caldo sul fondo e sotto il tetto (si accende), led e schermino
      const inner = M.inner.clone();
      add(g, new THREE.PlaneGeometry(PW - 0.05, PH - 0.14), inner, 0, 0.08 + (PH - 0.1) / 2, -PW / 2 + 0.017);
      add(g, new THREE.PlaneGeometry(PW - 0.05, PW - 0.05), inner, 0, PH - 0.016, 0, Math.PI / 2);
      const led = add(g, rbox(0.06, 0.012, 0.004, 0.003, 1), M.ledOff.clone(), 0.1, 0.045, PW / 2 + 0.002);
      add(g, rbox(0.1, 0.045, 0.006, 0.004, 1), M.screen, -0.09, 0.045, PW / 2 + 0.002);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0 }));
      gl.position.set(0, 0.27, 0.05); gl.scale.setScalar(0.62);
      g.add(gl);
      // bobina sopra, su un supporto
      const sp = group(g, 0, PH + 0.1, 0);
      add(sp, new THREE.CylinderGeometry(0.08, 0.08, 0.07, 16), new THREE.MeshPhysicalMaterial({ color: SPOOL_COLORS[i], roughness: 0.3, metalness: i === 2 ? 0.05 : 0.6, clearcoat: 0.5, bumpMap: layers, bumpScale: 0.5 }), 0, 0, 0, Math.PI / 2);
      add(sp, new THREE.CylinderGeometry(0.095, 0.095, 0.008, 16), M.flange, 0, 0, 0.04, Math.PI / 2);
      add(sp, new THREE.CylinderGeometry(0.095, 0.095, 0.008, 16), M.flange, 0, 0, -0.04, Math.PI / 2);
      add(sp, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), M.dark, 0, 0, 0, Math.PI / 2);
      add(sp, rbox(0.03, 0.09, 0.03, 0.008, 1), M.dark, 0, -0.055, -0.07);
      printers.push({ g, inner, led, gl });
    });
  }
  // monitor con tastiera
  const monitors = [];
  const monitorsAt = [[0.12, -0.02, Math.PI], [0.62, -0.02, Math.PI], [0.12, 0.5, 0], [0.62, 0.5, 0], [-1.35, 1.0, 0], [1.4, 1.05, 0], [-0.75, 0.05, Math.PI / 2]];
  monitorsAt.forEach(([x, z, ry]) => {
    const g = group(Lmach, x, TABLE_H, z, ry);
    add(g, rbox(0.1, 0.01, 0.07, 0.004, 1), M.silver, 0, 0.005, -0.08);
    add(g, rbox(0.02, 0.12, 0.015, 0.005, 1), M.silver, 0, 0.065, -0.1);
    add(g, rbox(0.36, 0.22, 0.02, 0.008, 1), M.black, 0, 0.2, -0.09, -0.08, 0, 0);
    add(g, new THREE.PlaneGeometry(0.34, 0.2), M.screen, 0, 0.2, -0.0785, -0.08, 0, 0);
    add(g, rbox(0.26, 0.01, 0.08, 0.004, 1), M.white, 0, 0.005, 0.07);
    monitors.push(g);
  });
  // piatto girevole e dinosauro in wireframe
  const turn = group(Lmach, BOOTH.x, 0.06, BOOTH.z);
  add(turn, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 32), M.silver, 0, 0.015, 0);
  add(turn, new THREE.TorusGeometry(0.34, 0.006, 6, 48), M.gold, 0, 0.03, 0, Math.PI / 2);
  const dino = group(turn, 0, 0.03, 0);
  {
    const dg = dinoGeometry();
    dino.add(new THREE.LineSegments(new THREE.EdgesGeometry(dg, 1), M.wire));
    dino.add(new THREE.Mesh(dg, M.wireFill));
    dino.scale.setScalar(1.25);
  }

  /* ================= 6 · LUCI: lampade, anello della cabina, laser di scansione ================= */
  const glowTex = radialTexture([[0, 'rgba(255,236,200,1)'], [0.25, 'rgba(255,214,150,0.45)'], [1, 'rgba(255,200,120,0)']]);
  printers.forEach((pr) => { pr.gl.material.map = glowTex; });
  const glows = [];
  const glow = (parent, x, y, z, s, o = 1) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: o }));
    sp.position.set(x, y, z); sp.scale.setScalar(s);
    parent.add(sp);
    glows.push(sp);
    return sp;
  };
  // lampade da tavolo (braccio snodato)
  const lampsAt = [[-0.62, 1.05, 0.6], [1.75, 1.0, -2.4], [0.9, 0.24, 2.6]];
  lampsAt.forEach(([x, z, ry]) => {
    const g = group(Llight, x, TABLE_H, z, ry);
    add(g, new THREE.CylinderGeometry(0.05, 0.055, 0.015, 12), M.dark, 0, 0.008, 0);
    add(g, rbox(0.015, 0.24, 0.015, 0.005, 1), M.silver, 0.03, 0.12, 0, 0, 0, -0.25);
    add(g, rbox(0.015, 0.22, 0.015, 0.005, 1), M.silver, 0.13, 0.3, 0, 0, 0, -1.2);
    const head = group(g, 0.23, 0.34, 0);
    add(head, new THREE.ConeGeometry(0.05, 0.08, 10, 1, true), M.gold, 0, 0, 0, 0, 0, 0);
    add(head, new THREE.CircleGeometry(0.045, 10), M.lampLight, 0, -0.04, 0, Math.PI / 2);
    glow(head, 0, -0.06, 0, 0.35, 0.9);
  });
  // anello di luce della cabina + laser di scansione che sale e scende + colonna di luce
  const ring = group(Llight, BOOTH.x, BH - 0.03, BOOTH.z);
  add(ring, new THREE.TorusGeometry(0.32, 0.012, 6, 48), M.lampLight, 0, 0, 0, Math.PI / 2);
  add(ring, new THREE.TorusGeometry(0.34, 0.01, 6, 48), M.dark, 0, 0.012, 0, Math.PI / 2);
  const scanRing = add(Llight, new THREE.TorusGeometry(0.4, 0.005, 4, 64), M.scan, BOOTH.x, 0.5, BOOTH.z, Math.PI / 2);
  const scanDisc = add(Llight, new THREE.CircleGeometry(0.4, 48), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(236,208,143,0)'], [0.7, 'rgba(236,208,143,0.05)'], [0.97, 'rgba(236,208,143,0.35)'], [1, 'rgba(236,208,143,0)']]),
    transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  }), BOOTH.x, 0.5, BOOTH.z, -Math.PI / 2);
  // lampada a stelo vicino allo scaffale
  {
    const g = group(Llight, -1.05, 0, -1.3);
    add(g, new THREE.CylinderGeometry(0.07, 0.08, 0.02, 12), M.dark, 0, 0.01, 0);
    add(g, new THREE.CylinderGeometry(0.008, 0.008, 1.1, 6), M.silver, 0, 0.56, 0);
    add(g, new THREE.CylinderGeometry(0.06, 0.1, 0.12, 12, 1, true), M.gold, 0, 1.12, 0);
    glow(g, 0, 1.05, 0, 0.55, 0.8);
  }
  /* ---------- ombra sotto il diorama ---------- */
  const shadow = add(root, new THREE.PlaneGeometry(7, 6), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(0,0,0,0.6)'], [0.5, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false
  }), 0, BASE_B - 0.01, 0, -Math.PI / 2);

  /* ---------- ombre di contatto: sul pavimento (arredi) e sui piani (macchine) ---------- */
  monitorsAt.forEach(([x, z, ry]) => { blobsTop.push([x, TABLE_H + 0.002, z, 0, ry, 0, 0.5, 1, 0.34]); });
  printers.forEach((pr) => blobsTop.push([pr.g.position.x, CAB_TOP + 0.002, pr.g.position.z, 0, 0, 0, 0.56, 1, 0.56]));
  inst(Lfloor, blobGeo, shadowMat, blobs).renderOrder = 1;
  inst(Lfurn, blobGeo, shadowMat, blobsTop).renderOrder = 1;

  /* ---------- linee di montaggio tratteggiate (disegno tecnico): si vedono solo nell'esploso ---------- */
  const guides = [];       // [strato basso, strato alto, x, y basso, y alto, z] in coordinate del diorama
  const guide = (la, ya, lb, yb, x, z) => guides.push([la, lb, x, ya, yb, z]);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => guide(0, GAP_B, 3, 0, sx * (FW / 2 - 0.03), sz * (FD / 2 - 0.03)));
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => guide(3, 0, 4, 0, BOOTH.x + sx * 0.44, BOOTH.z + sz * 0.44));
  [[-1, 1], [1, 1]].forEach(([sx, sz]) => guide(3, 0, 4, 0, 0.72 + sx * 0.8, -1.12 + sz * 0.25));
  guide(4, 0.06, 5, 0.06, BOOTH.x, BOOTH.z);
  guide(4, BH + 0.02, 6, BH - 0.03, BOOTH.x + 0.32, BOOTH.z);
  guide(4, BH + 0.02, 6, BH - 0.03, BOOTH.x - 0.32, BOOTH.z);
  printers.forEach((pr) => [-1, 1].forEach((sx) => guide(4, CAB_TOP, 5, CAB_TOP, pr.g.position.x + sx * (PW / 2 - 0.015), pr.g.position.z + PW / 2 - 0.015)));
  monitorsAt.forEach(([x, z]) => guide(4, TABLE_H, 5, TABLE_H, x, z));
  lampsAt.forEach(([x, z]) => guide(4, TABLE_H, 6, TABLE_H, x, z));
  guide(3, 0, 6, 0, -1.05, -1.3);
  tables.forEach(([x, z, ry, len]) => [-1, 1].forEach((s) => {
    const lx = s * (len / 2 - 0.13);
    guide(3, 0, 4, 0, x + lx * Math.cos(ry), z - lx * Math.sin(ry));
  }));
  const gPos = new Float32Array(guides.length * 6), gDist = new Float32Array(guides.length * 2);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('lineDistance', new THREE.BufferAttribute(gDist, 1).setUsage(THREE.DynamicDrawUsage));
  const gMat = new THREE.LineDashedMaterial({ color: 0xd9b36a, dashSize: 0.035, gapSize: 0.028, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const guideLines = new THREE.LineSegments(gGeo, gMat);
  guideLines.frustumCulled = false;
  model.add(guideLines);
  const updateGuides = () => {
    for (let i = 0; i < guides.length; i++) {
      const [la, lb, x, ya, yb, z] = guides[i];
      const y0 = ya + L[la].position.y, y1 = yb + L[lb].position.y;
      gPos.set([x, y0, z, x, y1, z], i * 6);
      gDist[i * 2] = 0; gDist[i * 2 + 1] = Math.abs(y1 - y0);
    }
    gGeo.attributes.position.needsUpdate = true;
    gGeo.attributes.lineDistance.needsUpdate = true;
  };

  /* ---------- etichette ---------- */
  const callouts = [...(ctx.overlay?.querySelectorAll('.callout[data-part]') || [])];
  const anchors = {
    printers: [printers[1].g, V(0, 0.62, 0)],
    scanner: [booth, V(0, BH + 0.06, 0.44)],
    desks: [Lfurn, V(tables[3][0] + 0.5, TABLE_H, tables[3][1] + 0.2)],
    shelves: [shelves[0], V(0.4, 1.05, 0.15)]
  };

  /* ---------- punti per l'inquadratura: angoli degli strati ---------- */
  model.updateMatrixWorld(true);
  const fit = [];
  {
    const box = new THREE.Box3(), inv = new THREE.Matrix4();
    L.forEach((obj) => {
      box.setFromObject(obj);
      inv.copy(obj.matrixWorld).invert();
      for (let i = 0; i < 8; i++) fit.push([obj, V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv)]);
    });
  }
  const wFit = fit.map(() => V());
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const wv = V(), bmin = V(), bmax = V(), camDir = V();
  const view = { t: V(), d: 1 };
  const fitView = (pts, el, kV, kH, out) => {
    const ce = Math.cos(el), se = Math.sin(el);
    bmin.set(1e9, 1e9, 1e9); bmax.set(-1e9, -1e9, -1e9);
    for (let i = 0; i < pts.length; i++) { bmin.min(pts[i]); bmax.max(pts[i]); }
    out.t.addVectors(bmin, bmax).multiplyScalar(0.5);
    let d = 0;
    for (let pass = 0; pass < 2; pass++) {
      d = 0;
      for (let i = 0; i < pts.length; i++) {
        wv.subVectors(pts[i], out.t);
        const xc = wv.x, yc = wv.y * ce - wv.z * se, zc = wv.y * se + wv.z * ce;
        d = Math.max(d, zc + Math.abs(yc) * kV, zc + Math.abs(xc) * kH);
      }
      if (pass) break;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < pts.length; i++) {
        wv.subVectors(pts[i], out.t);
        const xc = wv.x, yc = wv.y * ce - wv.z * se, zc = wv.y * se + wv.z * ce;
        const sx = xc / (d - zc), sy = yc / (d - zc);
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const mx = (x0 + x1) / 2 * d, my = (y0 + y1) / 2 * d;
      out.t.x += mx; out.t.y += my * ce; out.t.z -= my * se;
    }
    out.d = d;
  };
  const track = (p, keys) => {
    if (p <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (p <= keys[i][0]) {
        const [p0, v0] = keys[i - 1], [p1, v1] = keys[i];
        return lerp(v0, v1, smoothstep((p - p0) / (p1 - p0)));
      }
    }
    return keys[keys.length - 1][1];
  };
  const OFF = new THREE.Color(0x2a2620), ON = new THREE.Color(0xfff0d0), LED_OFF = new THREE.Color(0x2a2b2f), LED_ON = new THREE.Color(COLORS.bamboo);

  return {
    scene,
    camera,
    update(state) {
      const { p, t, pointer, w, h, aspect } = state;
      const idle = ctx.reduceMotion ? 0 : 1;
      const desk = smoothstep((aspect - 0.85) / 0.2);

      /* ---------- esplosione per strati (0.30–0.60) e ricomposizione (0.60–0.80) ---------- */
      /* gli spazi tra gli strati si aprono dal basso verso l'alto e si chiudono dall'alto:
         la quota di ogni strato è la somma degli spazi sotto di lui, così non si compenetrano mai */
      const k = lerp(0.78, 1, desk);
      let yAcc = 0;
      for (let i = 1; i < L.length; i++) {
        const a = 0.3 + (i - 1) * 0.02, b = 0.6 + (L.length - 1 - i) * 0.022;
        const e = easeInOutCubic(seg(p, a, a + 0.12)) * (1 - easeInOutCubic(seg(p, b, b + 0.12)));
        yAcc += e * GAPS[i] * k;
        L[i].position.y = yAcc;
      }
      const eMax = L[L.length - 1].position.y / (GAPS.reduce((a, b) => a + b, 0) * k);
      gMat.opacity = smoothstep(eMax * 1.6) * 0.8;
      guideLines.visible = gMat.opacity > 0.01;
      if (guideLines.visible) updateGuides();

      /* ---------- accensione (0.62–0.85) ---------- */
      printers.forEach((pr, i) => {
        const on = smoothstep(seg(p, 0.66 + i * 0.04, 0.72 + i * 0.04));
        pr.inner.color.copy(OFF).lerp(ON, 0.12 + 0.88 * on);
        pr.led.material.color.copy(LED_OFF).lerp(LED_ON, on);
        pr.gl.material.opacity = on * 0.85;
      });
      const scanOn = smoothstep(seg(p, 0.7, 0.8));
      scanRing.visible = scanDisc.visible = scanOn > 0.01;
      M.scan.opacity = scanOn;
      scanDisc.material.opacity = scanOn;
      const sy = 0.12 + (0.5 + 0.5 * Math.sin((idle ? t * 1.1 : 0) + p * 20)) * 0.95;
      scanRing.position.y = scanDisc.position.y = sy;
      dino.rotation.y = p * 4 + (idle ? t * 0.25 : 0);

      /* ---------- ingresso ruotando (0–0.30), vista dall'alto (0.85–1) ---------- */
      const enter = easeOutCubic(seg(p, 0, 0.3));
      const top = easeInOutCubic(seg(p, 0.85, 1));
      root.rotation.y = lerp(lerp(1.9, 0.74, enter), 0, top) + (idle ? Math.sin(t * 0.3) * 0.02 + pointer.x * 0.04 : 0) * (1 - top);
      model.position.y = 0;
      scene.updateMatrixWorld(true);

      /* ---------- camera ---------- */
      const el = lerp(lerp(0.52, 0.6, enter), 1.45, top) - (idle ? pointer.y * 0.03 : 0) * (1 - top);
      const offX = lerp(0, 0.2, desk), offY = lerp(0.2, 0, desk);
      camera.setViewOffset(w, h, -offX * w, offY * h, w, h);
      const availH = lerp(0.9, 0.56, desk), availV = lerp(0.42, 0.8, desk);
      const kV = 1 / (tanHalf * availV), kH = 1 / (tanHalf * aspect * availH);
      for (let i = 0; i < fit.length; i++) wFit[i].copy(fit[i][1]).applyMatrix4(fit[i][0].matrixWorld);
      fitView(wFit, el, kV, kH, view);
      camDir.set(0, Math.sin(el), Math.cos(el));
      camera.position.copy(view.t).addScaledVector(camDir, view.d);
      camera.lookAt(view.t);
      camera.updateMatrixWorld();

      /* ---------- etichette ---------- */
      if (callouts.length) {
        const cx = ctx.project(view.t).x;
        for (let i = 0; i < callouts.length; i++) {
          const elc = callouts[i], an = anchors[elc.dataset.part];
          if (!an) continue;
          wv.copy(an[1]).applyMatrix4(an[0].matrixWorld);
          const s = ctx.project(wv);
          elc.style.setProperty('--x', s.x.toFixed(1) + 'px');
          elc.style.setProperty('--y', s.y.toFixed(1) + 'px');
          let side = s.x < cx ? 'left' : 'right';
          if (side === 'right' && s.x > w - 200) side = 'left';
          if (side === 'left' && s.x < 200) side = 'right';
          elc.dataset.side = side;
        }
      }
    },
    resize() {},
    dispose() {
      floorTex.dispose(); glowTex.dispose(); softTex.dispose();
    }
  };
}
