/* Tillverka · scena "works" (sezione #lavori): tre lavori veri ricostruiti in 3D.
   1) sgabello Aura × Bambu Lab   p 0.00–0.34  (su bianco): si stampa, gira, esplode, si ricompone, sprofonda
   2) scultura in resina × Simone Gammino  p 0.34–0.67 (su nero): emerge dal piedistallo, apre le ali, gira
   3) Zigzig lamp   p 0.67–1.00 (su nero): scende, si accende, esplode in fette, si ricompone
   Tutte le pose sono funzioni pure di p (+ piccolo moto idle con t e puntatore). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seg, smoothstep, easeInOutCubic, easeOutCubic, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture, layerLinesTexture, createStudioEnv } from './materials.js';
import { pieceShapes, pieceAngle } from './logo-shape.js';

/* ---------- tempi (stessi intervalli dei testi in index.html) ---------- */
const T = {
  printA: 0.0, printB: 0.095, seatA: 0.084, seatB: 0.128,
  turnA: 0.12, turnB: 0.2, expA: 0.2, expB: 0.265, recA: 0.296, recB: 0.334,
  sinkA: 0.334, sinkB: 0.372,
  plinthA: 0.36, plinthB: 0.398, emergeA: 0.378, emergeB: 0.45, wingA: 0.395, wingB: 0.5,
  sSinkA: 0.612, sSinkB: 0.648, pSinkA: 0.64, pSinkB: 0.672,
  dropA: 0.668, dropB: 0.742, onA: 0.744, onB: 0.798, lexA: 0.8, lexB: 0.866, lrecA: 0.93, lrecB: 0.976
};

/* lampada: quota del fondo e discesa dal buio (servono anche alla camera) */
const LAMP_BOT = 0.34, LAMP_DROP = 1.4;
const LAMP_EXP = { top: 2.2, bot: -0.3 };      // ingombro dell'esploso (lo calcola la lampada)
/* esplosioni (funzioni pure di p: servono anche alla camera) */
const stoolE = (p) => easeInOutCubic(seg(p, T.expA, T.expB)) * (1 - easeInOutCubic(seg(p, T.recA, T.recB)));
const lampE = (p) => easeInOutCubic(seg(p, T.lexA, T.lexB)) * (1 - easeInOutCubic(seg(p, T.lrecA, T.lrecB)));
const lampDrop = (p) => (1 - easeOutCubic(seg(p, T.dropA, T.dropB))) * LAMP_DROP;

/* ---------- piccoli attrezzi ---------- */
const TAU = Math.PI * 2;
const easeInCubic = (x) => { x = clamp01(x); return x * x * x; };
function rng(seed) {                       // numeri casuali ripetibili (mulberry32)
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wrapPi = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

/* tubo con raggio variabile lungo la curva (rami organici: più grossi ai nodi, sottili a metà) */
function taperedTube(curve, segs, radial, rFn) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = rFn(t), n = frames.normals[i], b = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, s = Math.sin(a), c = -Math.cos(a);
      N.set(c * n.x + s * b.x, c * n.y + s * b.y, c * n.z + s * b.z).normalize();
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      nor.push(N.x, N.y, N.z);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* profilo rettangolare con angoli arrotondati, chiuso (per LatheGeometry: anelli) */
function roundedRectPath(x0, x1, y0, y1, c, n = 5) {
  const pts = [new THREE.Vector2(x0, (y0 + y1) / 2)];
  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * c, cy + Math.sin(a) * c));
    }
  };
  arc(x0 + c, y0 + c, Math.PI, Math.PI * 1.5);
  arc(x1 - c, y0 + c, Math.PI * 1.5, TAU);
  arc(x1 - c, y1 - c, 0, Math.PI * 0.5);
  arc(x0 + c, y1 - c, Math.PI * 0.5, Math.PI);
  pts.push(new THREE.Vector2(x0, (y0 + y1) / 2));
  return pts;
}

/* uv "a strati": u = angolo, v = quota → le righe della texture diventano strati orizzontali veri */
function layerUV(geo, perUnit) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / TAU + 0.5;
    uv[i * 2 + 1] = p.getY(i) * perUnit;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
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

/* righe di stampa sottili e morbide (per roughness/bump), n righe per ripetizione */
function fineLayers(n) {
  const t = canvasTex(4, 256, (g, w, h) => {
    const step = h / n;
    for (let i = 0; i < n; i++) {
      const grd = g.createLinearGradient(0, i * step, 0, (i + 1) * step);
      grd.addColorStop(0, '#9a9a9a'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#9a9a9a');
      g.fillStyle = grd; g.fillRect(0, i * step, w, step);
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* legno di bambù pressato: 'top' = listelli con fibre dritte e nodi, 'side' = fibre che girano sul fianco */
function bambooSeatTex(kind) {
  const R = rng(kind === 'top' ? 11 : 12);
  const t = canvasTex(1024, kind === 'top' ? 1024 : 256, (g, w, h) => {
    g.fillStyle = '#d3b27b'; g.fillRect(0, 0, w, h);
    if (kind === 'top') {
      const strips = 8, sh = h / strips;
      for (let s = 0; s < strips; s++) {
        const k = (R() - 0.5) * 0.16;
        g.fillStyle = k > 0 ? `rgba(255,236,196,${k})` : `rgba(120,80,35,${-k})`;
        g.fillRect(0, s * sh, w, sh);
        g.fillStyle = 'rgba(92,60,25,0.35)'; g.fillRect(0, s * sh, w, 1.5);
        for (let n = 0; n < 3; n++) {                // nodi del bambù: bande scure brevi sul listello
          const x = R() * w, wd = 5 + R() * 6;
          const grd = g.createLinearGradient(x - wd, 0, x + wd, 0);
          grd.addColorStop(0, 'rgba(110,72,30,0)'); grd.addColorStop(0.5, 'rgba(110,72,30,0.32)'); grd.addColorStop(1, 'rgba(110,72,30,0)');
          g.fillStyle = grd; g.fillRect(x - wd, s * sh + 2, wd * 2, sh - 3);
        }
      }
    } else {
      for (let l = 0; l < 5; l++) { g.fillStyle = 'rgba(96,62,26,0.22)'; g.fillRect(0, (l + 0.5) * (h / 5), w, 1.2); }
    }
    for (let i = 0; i < (kind === 'top' ? 2600 : 900); i++) {   // fibre
      const y = R() * h, a = 0.04 + R() * 0.12;
      g.strokeStyle = R() < 0.55 ? `rgba(140,98,48,${a})` : `rgba(255,242,212,${a})`;
      g.lineWidth = 0.5 + R() * 1.4;
      g.beginPath();
      const x0 = R() * w * 0.6 - w * 0.2, len = w * (0.3 + R() * 0.8);
      g.moveTo(x0, y);
      g.bezierCurveTo(x0 + len * 0.3, y + (R() - 0.5) * 3, x0 + len * 0.7, y + (R() - 0.5) * 3, x0 + len, y + (R() - 0.5) * 2);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* piano orizzontale morbido (ombra di contatto, pozza di luce, alone a terra) */
function floorDecal(tex, size, additive) {
  const m = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}

/* "strato appena stampato": vicino al piano di taglio il materiale brilla oro e poi si raffredda.
   dir = 1 brilla sotto la quota (stampa che sale), -1 sopra (oggetto che esce dal pavimento) */
function addHeat(material, band = 0.07) {
  const u = {
    uCutY: { value: -100 }, uCutDir: { value: 1 }, uHeat: { value: 0 }, uBand: { value: band },
    uHeatColor: { value: new THREE.Color(COLORS.glow).multiplyScalar(2.2) }
  };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying float vWY;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = 'varying float vWY;\nuniform float uCutY, uCutDir, uHeat, uBand;\nuniform vec3 uHeatColor;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float d = (uCutY - vWY) * uCutDir; float k = d >= 0.0 ? 1.0 - clamp(d / uBand, 0.0, 1.0) : 0.0;
    totalEmissiveRadiance += uHeatColor * (k * k * k * uHeat); }`);
  };
  material.customProgramCacheKey = () => 'tlk-heat';
  return u;
}

/* bordo luminoso (fresnel) per la resina: gli spigoli delle lame si accendono come nella foto */
function addRim(material, color, power, strength) {
  const u = { uRim: { value: strength }, uRimPow: { value: power }, uRimColor: { value: new THREE.Color(color) } };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform float uRim, uRimPow;\nuniform vec3 uRimColor;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float f = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
    totalEmissiveRadiance += uRimColor * (pow(f, uRimPow) * uRim); }`);
  };
  material.customProgramCacheKey = () => 'tlk-rim';
  return u;
}

/* ====================================================================================== */
export async function create(ctx) {
  const { renderer, small } = ctx;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
  scene.add(camera);

  /* ambienti: chiaro per lo sgabello (sta su bianco), scuro per scultura e lampada (su nero) */
  const envLight = ctx.theme === 'light' ? ctx.env : createStudioEnv(renderer, 'light');
  const envDark = ctx.theme === 'dark' ? ctx.env : createStudioEnv(renderer, 'dark');
  scene.environment = envDark;

  /* luci: 1 key + 1 rim + 1 fill (intensità miscelate per segmento) */
  const key = new THREE.DirectionalLight(0xfff3e2, 2);
  key.position.set(3.5, 6, 4.5);
  const rim = new THREE.DirectionalLight(0xe4ecff, 2);
  rim.position.set(-4.5, 3.5, -5);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-5, 1.2, 3);
  scene.add(key, rim, fill);

  /* piani di taglio (in coordinate mondo) */
  const floorClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);        // tiene y ≥ 0 (pavimento)
  const printClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);     // tiene y ≤ quota di stampa
  const ghostClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100);      // anteprima: tiene y ≥ quota
  const emergeClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100);     // scultura: sopra il piedistallo

  const goldCut = (planes) => new THREE.MeshBasicMaterial({
    color: new THREE.Color(COLORS.glow).multiplyScalar(1.1), side: THREE.BackSide, toneMapped: false, clippingPlanes: planes
  });

  const heroes = {};

  /* =========================== 1 · SGABELLO AURA =========================== */
  {
    const root = new THREE.Group();
    scene.add(root);
    const R = rng(20260420);
    const N = 6;                                      // colonne del reticolo (2 per ognuno dei 3 pannelli)
    const LV = [0, 0.17, 0.33, 0.47, 0.6, 0.74, 0.87, 1];
    const Y0 = 0.025, Y1 = 0.995;
    const rad = (v) => 0.35 + 0.36 * (v - 0.53) * (v - 0.53);   // vita stretta al centro
    const surf = (th, v, off, out) => {
      const r = rad(v) + off;
      return out.set(Math.cos(th) * r, Y0 + v * (Y1 - Y0), Math.sin(th) * r);
    };
    class Branch extends THREE.Curve {
      constructor(a, b, bow, lean = 0.18) {
        super();
        const dth = wrapPi(b.th - a.th), dv = b.v - a.v;
        this.p = [a.th, a.v, a.th + dth * lean, a.v + dv * 0.44, a.th + dth * (1 - lean), b.v - dv * 0.44, a.th + dth, b.v];
        this.bow = bow;
      }
      getPoint(t, out = new THREE.Vector3()) {
        const q = this.p, u = 1 - t;
        const k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
        const th = k0 * q[0] + k1 * q[2] + k2 * q[4] + k3 * q[6];
        const v = k0 * q[1] + k1 * q[3] + k2 * q[5] + k3 * q[7];
        return surf(th, v, this.bow * Math.sin(Math.PI * t), out);
      }
    }
    /* nodi a nido d'ape sul cilindro: rami che si dividono e si ricongiungono (come la crescita di un Voronoi) */
    const nodes = new Map();
    const key2 = (L, h) => L + ':' + (((h % (2 * N)) + 2 * N) % (2 * N));
    for (let L = 0; L < LV.length; L++) {
      const par = Math.floor(L / 2) % 2;
      for (let k = 0; k < N; k++) {
        const h = par + 2 * k, edge = L === 0 || L === LV.length - 1;
        nodes.set(key2(L, h), {
          L, h,
          th: (h * Math.PI) / N + (R() - 0.5) * (edge ? 0.06 : 0.24),
          v: LV[L] + (edge ? 0 : (R() - 0.5) * 0.06),
          r: L === 0 ? 0.044 : L === LV.length - 1 ? 0.038 : 0.031 + R() * 0.007
        });
      }
    }
    const segs = small ? 18 : 30, radial = small ? 8 : 12;
    const PANELS = 6;                                 // gruppi di rami che volano via nell'esploso
    const panelGeos = Array.from({ length: PANELS }, () => []);
    const panelOf = (h) => Math.floor((((h % (2 * N)) + 2 * N) % (2 * N)) / 2 / (N / PANELS));
    const addBranch = (a, b, pnl, bow, lean) => {
      const c = new Branch(a, b, bow, lean);
      const ra = a.r * 0.97, rb = b.r * 0.97;
      panelGeos[pnl].push(taperedTube(c, segs, radial, (t) => lerp(ra, rb, t) * (1 - 0.3 * Math.sin(Math.PI * t))));
    };
    for (let L = 0; L < LV.length - 1; L++) {
      const par = Math.floor(L / 2) % 2;
      for (let k = 0; k < N; k++) {
        const h = par + 2 * k, a = nodes.get(key2(L, h));
        if (L % 2 === 0) addBranch(a, nodes.get(key2(L + 1, h)), panelOf(h), (R() - 0.5) * 0.03, 0.18);
        else {
          for (const d of [-1, 1]) {
            const b = nodes.get(key2(L + 1, h + d));
            addBranch(a, b, panelOf(a.h % 2 === 0 ? a.h : b.h), (R() < 0.5 ? -1 : 1) * (0.025 + R() * 0.03), 0.16);
          }
        }
      }
    }
    /* rami interni che si incrociano in profondità (le "X" della foto) */
    for (let k = 0; k < N; k++) {
      const a = nodes.get(key2(2, 1 + 2 * k)), b = nodes.get(key2(5, 2 * k + 2));
      const c = new Branch(a, b, -0.07, 0.3);
      panelGeos[panelOf(a.h)].push(taperedTube(c, segs, radial, (t) => 0.024 * (1 - 0.3 * Math.sin(Math.PI * t))));
    }
    /* sfere ai nodi: giunzioni morbide */
    const ball = new THREE.SphereGeometry(1, small ? 12 : 16, small ? 8 : 12);
    const P = new THREE.Vector3();
    for (const n of nodes.values()) {
      if (n.L === 0 || n.L === LV.length - 1) continue;
      const g = ball.clone();
      surf(n.th, n.v, 0, P);
      g.scale(n.r * 1.04, n.r * 1.25, n.r * 1.04).translate(P.x, P.y, P.z);
      panelGeos[panelOf(n.h)].push(g);
    }
    const LINES = 2.2;                               // ripetizioni delle righe (texture da 64 righe) per unità
    const panels = panelGeos.map((list) => layerUV(mergeGeometries(list), LINES));

    /* anelli: piede e anello alto sotto la seduta */
    const lat = small ? 64 : 120;
    const footGeo = layerUV(new THREE.LatheGeometry(roundedRectPath(0.398, 0.478, 0, 0.046, 0.014), lat), LINES);
    const topRingGeo = layerUV(new THREE.LatheGeometry(roundedRectPath(0.398, 0.466, 0.972, 1.034, 0.014), lat), LINES);

    const layerTex = fineLayers(64);
    const legsMat = mat.satinSilver({
      color: 0xa9adb5, roughness: 0.3, envMap: envLight, envMapIntensity: 1.1,
      roughnessMap: layerTex, bumpMap: layerTex, bumpScale: 0.12,
      clippingPlanes: [printClip, floorClip]
    });
    const legsHeat = addHeat(legsMat, 0.08);
    const cutMat = goldCut([printClip, floorClip]);
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0xaeb3bb, metalness: 0.3, roughness: 0.5, transparent: true, opacity: 0.15,
      depthWrite: false, envMap: envLight, clippingPlanes: [ghostClip]
    });

    const legs = new THREE.Group();
    root.add(legs);
    const ghostLegs = new THREE.Mesh(mergeGeometries([...panels, footGeo, topRingGeo]), ghostMat);
    ghostLegs.renderOrder = 3;
    root.add(ghostLegs);
    /* ogni gruppo di rami ruota attorno al proprio baricentro: la geometria viene centrata sul perno */
    const panelMeshes = panels.map((g, k) => {
      g.computeBoundingBox();
      const c0 = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-c0.x, -c0.y, -c0.z);
      const grp = new THREE.Group();
      const c = new THREE.Mesh(g, cutMat);
      grp.add(new THREE.Mesh(g, legsMat), c);
      grp.userData.dir = Math.atan2(c0.z, c0.x);
      grp.userData.home = c0;
      grp.userData.cut = c;
      grp.position.copy(c0);
      legs.add(grp);
      return grp;
    });
    const foot = new THREE.Group();
    foot.add(new THREE.Mesh(footGeo, legsMat), new THREE.Mesh(footGeo, cutMat));
    const topRing = new THREE.Group();
    topRing.add(new THREE.Mesh(topRingGeo, legsMat), new THREE.Mesh(topRingGeo, cutMat));
    legs.add(foot, topRing);

    /* seduta in legno di bambù: disco con bordo arrotondato, fuga sul fianco, cupola appena accennata */
    const SR = 0.5, ST = 0.17, SY = 1.03;
    const cb = 0.016, ct = 0.06, g0 = 0.05;
    const side = [new THREE.Vector2(0, 0), new THREE.Vector2(SR - cb, 0)];
    for (let i = 1; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2); side.push(new THREE.Vector2(SR - cb + Math.cos(a) * cb, cb + Math.sin(a) * cb)); }
    side.push(new THREE.Vector2(SR, g0 - 0.007), new THREE.Vector2(SR - 0.0055, g0), new THREE.Vector2(SR, g0 + 0.007));
    side.push(new THREE.Vector2(SR, ST - ct));
    for (let i = 1; i <= 4; i++) { const a = (i / 8) * (Math.PI / 2); side.push(new THREE.Vector2(SR - ct + Math.cos(a) * ct, ST - ct + Math.sin(a) * ct)); }
    const topP = [];
    for (let i = 4; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); topP.push(new THREE.Vector2(SR - ct + Math.cos(a) * ct, ST - ct + Math.sin(a) * ct)); }
    for (let i = 1; i <= 10; i++) { const r = (SR - ct) * (1 - i / 10); topP.push(new THREE.Vector2(r, ST + 0.005 * (1 - (r / (SR - ct)) ** 2))); }
    const segSeat = small ? 72 : 144;
    const seatSideGeo = new THREE.LatheGeometry(side, segSeat);
    const seatTopGeo = new THREE.LatheGeometry(topP, segSeat);
    {  // uv: piano sopra (fibre dritte), cilindrico sul fianco (fibre che girano)
      const p = seatTopGeo.attributes.position, uv = seatTopGeo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.95 + 0.5, p.getZ(i) * 0.95 + 0.5);
      const q = seatSideGeo.attributes.position, uq = seatSideGeo.attributes.uv;
      for (let i = 0; i < q.count; i++) {
        const y = q.getY(i);
        if (y < 0.0005) uq.setXY(i, q.getX(i) * 0.9 + 0.5, q.getZ(i) * 0.9 + 0.5);
        else uq.setXY(i, (Math.atan2(q.getZ(i), q.getX(i)) / TAU + 0.5) * 3, y / ST);
      }
    }
    const seatTopMat = mat.bambooWood({ map: bambooSeatTex('top'), envMap: envLight, envMapIntensity: 0.7, clippingPlanes: [floorClip] });
    const seatSideMat = mat.bambooWood({ map: bambooSeatTex('side'), envMap: envLight, envMapIntensity: 0.7, clippingPlanes: [floorClip] });
    const seatHeatA = addHeat(seatTopMat, 0.08), seatHeatB = addHeat(seatSideMat, 0.08);
    const seat = new THREE.Group();
    const seatCutMat = goldCut([floorClip]);
    seat.add(new THREE.Mesh(seatTopGeo, seatTopMat), new THREE.Mesh(seatSideGeo, seatSideMat));
    const seatCuts = [new THREE.Mesh(seatTopGeo, seatCutMat), new THREE.Mesh(seatSideGeo, seatCutMat)];
    seat.add(...seatCuts);
    /* triscele Tillverka inciso a fuoco al centro della seduta + anello inciso vicino al bordo */
    const { face } = pieceShapes(THREE);
    const logoGeo = mergeGeometries([0, 1, 2].map((k) => new THREE.ShapeGeometry(face, 6).rotateZ(pieceAngle(k))));
    logoGeo.scale(0.1, 0.1, 1).rotateX(-Math.PI / 2).translate(0, ST + 0.0052, 0);
    const burnt = new THREE.MeshStandardMaterial({
      color: 0x4e3218, roughness: 0.92, envMap: envLight, envMapIntensity: 0.35,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, clippingPlanes: [floorClip]
    });
    seat.add(new THREE.Mesh(logoGeo, burnt));
    const ringGeo = new THREE.RingGeometry(0.4, 0.4055, 128).rotateX(-Math.PI / 2).translate(0, ST + 0.0014, 0);
    seat.add(new THREE.Mesh(ringGeo, burnt));
    seat.position.y = SY;
    root.add(seat);
    const ghostSeatMat = ghostMat.clone();
    ghostSeatMat.clippingPlanes = [];
    const ghostSeat = new THREE.Group();
    ghostSeat.add(new THREE.Mesh(seatTopGeo, ghostSeatMat), new THREE.Mesh(seatSideGeo, ghostSeatMat));
    ghostSeat.position.y = SY;
    ghostSeat.children.forEach((m) => { m.renderOrder = 3; });
    root.add(ghostSeat);

    /* fissaggi nascosti: flangia in metallo sotto la seduta + 6 viti oro (si vedono solo nell'esploso) */
    const FR0 = 0.335, FR1 = 0.47, FT = 0.014, NS = 6, SCR = 0.43;
    const flangeGeo = new THREE.LatheGeometry(roundedRectPath(FR0, FR1, -FT, 0, 0.005, 3), lat);
    const flangeMat = mat.satinSilver({ color: 0x9a9ea6, roughness: 0.24, envMap: envLight, envMapIntensity: 1.2, clippingPlanes: [floorClip] });
    const flange = new THREE.Group();
    flange.add(new THREE.Mesh(flangeGeo, flangeMat));
    /* tre razze sottili che uniscono la flangia al mozzo centrale */
    const hubGeo = new THREE.LatheGeometry(roundedRectPath(0.05, 0.1, -FT, 0, 0.005, 3), 48);
    const spokeGeo = new THREE.BoxGeometry(FR0 - 0.08, FT * 0.8, 0.034);
    const spokes = [hubGeo];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.PI / 6;
      spokes.push(spokeGeo.clone().translate((FR0 + 0.1) / 2 - 0.01, -FT / 2, 0).rotateY(-a));
    }
    flange.add(new THREE.Mesh(mergeGeometries(spokes), flangeMat));
    /* fori svasati sulla flangia */
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x1a1b1e, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, clippingPlanes: [floorClip] });
    const holes = [];
    for (let i = 0; i < NS; i++) {
      const a = (i / NS) * TAU + Math.PI / NS;
      holes.push(new THREE.CircleGeometry(0.0085, 16).rotateX(-Math.PI / 2).translate(Math.cos(a) * SCR, 0.0006, Math.sin(a) * SCR));
    }
    flange.add(new THREE.Mesh(mergeGeometries(holes), holeMat));
    root.add(flange);
    /* vite: testa bombata in basso, gambo filettato verso l'alto, punta */
    const scrP = [new THREE.Vector2(0, -0.007), new THREE.Vector2(0.011, -0.007), new THREE.Vector2(0.0135, -0.005), new THREE.Vector2(0.0135, -0.002), new THREE.Vector2(0.0105, 0), new THREE.Vector2(0.0048, 0)];
    for (let i = 0; i < 10; i++) {
      const y = 0.003 + i * 0.0042;
      scrP.push(new THREE.Vector2(0.0062, y), new THREE.Vector2(0.0046, y + 0.0021));
    }
    scrP.push(new THREE.Vector2(0.0042, 0.047), new THREE.Vector2(0.0008, 0.056), new THREE.Vector2(0, 0.056));
    const screwGeo = new THREE.LatheGeometry(scrP, 16);
    const screwMat = mat.gold({ envMap: envLight, envMapIntensity: 1.5, roughness: 0.2, clippingPlanes: [floorClip] });
    const screws = new THREE.InstancedMesh(screwGeo, screwMat, NS);
    screws.frustumCulled = false;
    root.add(screws);
    const sM = new THREE.Matrix4(), sQ = new THREE.Quaternion(), sS = new THREE.Vector3(1.25, 1.25, 1.25), sV = new THREE.Vector3();
    const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), tAx = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

    /* ombra di contatto (scura: sta su bianco) */
    const shadowSoft = floorDecal(radialTexture([[0, 'rgba(0,0,0,0.34)'], [0.4, 'rgba(0,0,0,0.16)'], [1, 'rgba(0,0,0,0)']]), 1.55, false);
    const shadowRing = floorDecal(radialTexture([[0, 'rgba(0,0,0,0)'], [0.74, 'rgba(0,0,0,0.0)'], [0.84, 'rgba(0,0,0,0.5)'], [0.9, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]), 1.12, false);
    shadowSoft.position.y = 0.001; shadowRing.position.y = 0.0015;
    scene.add(shadowSoft, shadowRing);

    heroes.stool = {
      root,
      update(p, t, idle, pointer) {
        const on = p < T.sinkB + 0.01;
        root.visible = on;
        shadowSoft.visible = shadowRing.visible = on;
        if (!on) return { e: 0 };
        /* stampa: la quota sale a velocità costante, sopra c'è l'anteprima trasparente */
        const ps = seg(p, T.printA, T.printB);
        const pr = lerp(0.06, 1, ps * ps * (1.6 - 0.6 * ps));
        const printing = pr < 0.999;
        const hPrint = printing ? pr * 1.035 : 100;
        /* seduta appoggiata dall'alto */
        const sd = seg(p, T.seatA, T.seatB);
        const seatIn = easeOutCubic(sd);
        /* giro, esplosione in tre pannelli (come i tre pezzi del logo), ricomposizione, uscita nel pavimento */
        const turn = easeInOutCubic(seg(p, T.turnA, T.turnB)) * Math.PI * 0.95 + seg(p, T.turnB, T.sinkB) * Math.PI * 0.5;
        const e = stoolE(p);
        const sink = easeInCubic(seg(p, T.sinkA, T.sinkB));

        root.position.y = -sink * 1.3;
        root.rotation.y = -0.4 + turn + idle * (Math.sin(t * 0.32) * 0.05 + pointer.x * 0.14);
        root.rotation.x = idle * -pointer.y * 0.04;

        printClip.constant = hPrint + root.position.y;
        ghostClip.constant = -(hPrint + root.position.y);
        ghostLegs.visible = printing;
        /* calore: sulla quota di stampa, poi sul pavimento mentre sprofonda */
        const heatOn = printing ? 1 : sink > 0 ? 1 : 0;
        legsHeat.uCutY.value = printing ? hPrint + root.position.y : 0;
        legsHeat.uCutDir.value = printing ? 1 : -1;
        legsHeat.uHeat.value = heatOn;
        for (const h of [seatHeatA, seatHeatB]) { h.uCutY.value = 0; h.uCutDir.value = -1; h.uHeat.value = sink > 0 ? 1 : 0; }
        const cutOn = printing || sink > 0;
        /* esploso: 6 gruppi di rami volano via in raggiera ruotando (partenza sfalsata), poi scattano al loro posto */
        panelMeshes.forEach((g, k) => {
          const d = g.userData.dir, h0 = g.userData.home;
          const ek = easeInOutCubic(seg(p, T.expA + k * 0.004, T.expB + k * 0.004)) * (1 - easeInCubic(seg(p, T.recA + (5 - k) * 0.003, T.recB)));
          const out = ek * 0.5;
          g.position.set(h0.x + Math.cos(d) * out, h0.y + ek * (0.1 + 0.07 * Math.sin(k * 2.3)), h0.z + Math.sin(d) * out);
          tAx.set(-Math.sin(d), 0, Math.cos(d));
          qA.setFromAxisAngle(tAx, -ek * 0.42);                       // la cima si piega verso fuori
          qB.setFromAxisAngle(UP, ek * (k % 2 ? 0.55 : -0.55));        // e il gruppo gira su se stesso
          g.quaternion.multiplyQuaternions(qB, qA);
          g.userData.cut.visible = cutOn;
        });
        foot.children[1].visible = topRing.children[1].visible = cutOn;
        topRing.position.y = e * 0.2;
        topRing.rotation.y = -e * 0.3;
        foot.position.y = 0;
        /* seduta: legno in alto, viti a metà, flangia sotto; al rientro un piccolo rimbalzo (lo "scatto") */
        const snapK = seg(p, T.recB - 0.006, T.recB + 0.022);
        const snap = 0.028 * Math.sin(Math.PI * snapK) * (1 - snapK);
        const seatY = SY + (1 - seatIn) * 0.55 + snap;
        seat.visible = sd > 0;
        seat.position.y = seatY + e * 0.9;
        seat.rotation.x = e * 0.16;
        seat.rotation.y = e * 0.5;
        flange.visible = screws.visible = sd > 0;
        flange.position.y = seatY + e * 0.42;
        flange.rotation.set(e * 0.08, -e * 0.35, 0);
        for (let i = 0; i < NS; i++) {
          const a = (i / NS) * TAU + Math.PI / NS - e * 0.35;
          sV.set(Math.cos(a) * SCR * (1 + e * 0.12), seatY + e * 0.66 - 0.05 * (1 - e) + 0.004, Math.sin(a) * SCR * (1 + e * 0.12));
          sQ.setFromAxisAngle(UP, e * TAU * 1.5 + i);                  // si svitano
          screws.setMatrixAt(i, sM.compose(sV, sQ, sS));
        }
        screws.instanceMatrix.needsUpdate = true;
        seatCuts.forEach((m) => { m.visible = sink > 0; });
        ghostSeat.visible = sd < 1;
        ghostSeatMat.opacity = 0.15 * (1 - seatIn);
        /* ombra: segue lo sfondo (sparisce quando la pagina diventa nera) */
        const dk = smoothstep(seg(p, 0.3, 0.38));
        const so = (1 - dk) * (1 - sink) * lerp(0.6, 1, pr);
        shadowSoft.material.opacity = so * (1 - e * 0.4);
        shadowRing.material.opacity = so * (1 - e * 0.5);
        const sc = 1 + e * 0.8;
        shadowSoft.scale.set(sc, sc, 1);
        return { e };
      }
    };
  }

  /* =========================== 2 · SCULTURA IN RESINA =========================== */
  {
    const root = new THREE.Group();
    scene.add(root);
    const PH = 0.2;                                  // altezza piedistallo
    /* piedistallo grafite tornito: base stretta, piano largo con sottosquadro inclinato */
    const plinthProfile = [
      new THREE.Vector2(0, 0), new THREE.Vector2(0.285, 0), new THREE.Vector2(0.296, 0.004), new THREE.Vector2(0.3, 0.014),
      new THREE.Vector2(0.3, 0.1), new THREE.Vector2(0.305, 0.107), new THREE.Vector2(0.45, 0.158),
      new THREE.Vector2(0.462, 0.164), new THREE.Vector2(0.466, 0.172), new THREE.Vector2(0.466, 0.19),
      new THREE.Vector2(0.462, 0.197), new THREE.Vector2(0.452, 0.2), new THREE.Vector2(0, PH)
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthProfile, small ? 64 : 96);
    const plinthMat = mat.graphite({ envMap: envDark, color: 0x2a2c31, roughness: 0.34, clippingPlanes: [floorClip] });
    const plinthHeat = addHeat(plinthMat, 0.06);
    const plinth = new THREE.Group();
    plinth.add(new THREE.Mesh(plinthGeo, plinthMat));
    const plinthCut = new THREE.Mesh(plinthGeo, goldCut([floorClip]));
    plinth.add(plinthCut);
    root.add(plinth);

    const crystal = mat.crystalResin({
      envMap: envDark, envMapIntensity: 1.5, thickness: 0.32, roughness: 0.02, dispersion: 2.2,
      attenuationDistance: 1.8, clippingPlanes: [emergeClip]
    });
    const rimU = addRim(crystal, 0xdfe8ff, 2.6, 0.9);
    const fig = new THREE.Group();
    root.add(fig);

    /* base di stampa (zattera) sottile */
    const raft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.176, 0.014, 48), crystal);
    raft.position.y = 0.007;
    fig.add(raft);

    /* spina dorsale: vertebre sfaccettate su un'anima sottile */
    const beadGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0.0, -0.028), new THREE.Vector2(0.02, -0.022), new THREE.Vector2(0.034, -0.004),
      new THREE.Vector2(0.034, 0.004), new THREE.Vector2(0.02, 0.022), new THREE.Vector2(0.0, 0.028)
    ], 6);
    const NB = 17;
    const beads = new THREE.InstancedMesh(beadGeo, crystal, NB);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), EU = new THREE.Euler();
    for (let i = 0; i < NB; i++) {
      const k = i / (NB - 1);
      const s = lerp(0.72, 1.08, k);
      V.set(0, 0.045 + i * 0.056, 0);
      Q.setFromEuler(EU.set(0, (i % 2) * (Math.PI / 6), 0));
      S.set(s, s * 1.1, s);
      beads.setMatrixAt(i, M.compose(V, Q, S));
    }
    fig.add(beads);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.98, 8), crystal);
    rod.position.y = 0.5;
    fig.add(rod);

    /* torace e testa: gemme sfaccettate */
    const gem = new THREE.IcosahedronGeometry(1, 1);
    const thorax = new THREE.Mesh(gem, crystal);
    thorax.scale.set(0.068, 0.15, 0.056);
    thorax.position.y = 1.14;
    const head = new THREE.Mesh(gem, crystal);
    head.scale.set(0.046, 0.05, 0.044);
    head.position.y = 1.33;
    fig.add(thorax, head);

    /* petalo/lama sottile: griglia lenticolare (spessa al centro, a filo sui bordi), incurvata e ondulata */
    function petalGeo(w, curl, cup, ripple, th, nu, nv) {
      const pos = [], idx = [];
      const hw = (u) => w * Math.max(0.03, Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.8));
      const sheet = (sgn) => {
        const base = pos.length / 3;
        for (let i = 0; i <= nu; i++) {
          const u = i / nu;
          for (let k = 0; k <= nv; k++) {
            const v = -1 + (2 * k) / nv;
            const y = v * hw(u) + 0.04 * w * Math.sin(u * Math.PI) * (1 - v * v);
            const zc = curl * u * u + cup * v * v * hw(u) + ripple * Math.sin(u * 17 + v * 2.4) * (0.2 + Math.abs(v)) * hw(u) * 3;
            const tk = th * Math.sqrt(Math.max(0, 1 - v * v)) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.96 + 0.02)), 0.4);
            pos.push(u, y, zc + sgn * tk);
          }
        }
        for (let i = 0; i < nu; i++) {
          for (let k = 0; k < nv; k++) {
            const a = base + i * (nv + 1) + k, b = a + nv + 1;
            if (sgn > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
            else idx.push(a, a + 1, b, b, a + 1, b + 1);
          }
        }
      };
      sheet(1); sheet(-1);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    const nu = small ? 16 : 26, nv = small ? 6 : 10;
    const PET = {
      broad: petalGeo(0.25, 0.1, 0.05, 0.012, 0.011, nu, nv),
      mid: petalGeo(0.17, 0.12, 0.04, 0.012, 0.01, nu, nv),
      blade: petalGeo(0.09, 0.08, 0.03, 0.01, 0.009, nu, Math.max(4, nv - 4))
    };

    /* ali: ogni ala = ventaglio stretto di lame sovrapposte. angolo nel piano frontale (0 = orizzontale verso fuori) */
    const WINGS = [
      { y: 0.94, open: -1.32, fold: -1.5, spread: 0.1, sweep: 0.12, t: 0, petals: [['blade', 0.6], ['mid', 0.52], ['blade', 0.44]] },
      { y: 1.07, open: -0.7, fold: -1.42, spread: 0.2, sweep: 0.3, t: 0.2, petals: [['broad', 0.72], ['broad', 0.64], ['mid', 0.55], ['mid', 0.46]] },
      { y: 1.23, open: 0.88, fold: 1.4, spread: 0.18, sweep: 0.26, t: 0.42, petals: [['broad', 0.5], ['mid', 0.45], ['mid', 0.37]] }
    ];
    const petals = [], antennas = [];
    [1, -1].forEach((sx) => {
      const side = new THREE.Group();
      side.scale.x = sx;
      fig.add(side);
      WINGS.forEach((wg) => {
        const wing = new THREE.Group();
        wing.position.set(0.024, wg.y, 0);
        side.add(wing);
        const n = wg.petals.length;
        wg.petals.forEach(([kind, len], i) => {
          const pivot = new THREE.Group();
          const m = new THREE.Mesh(PET[kind], crystal);
          m.scale.setScalar(len);
          m.rotation.x = (i % 2 ? 1 : -1) * 0.2 + (i - n / 2) * 0.05;
          m.position.z = (i - (n - 1) / 2) * 0.014;
          pivot.add(m);
          wing.add(pivot);
          petals.push({ pivot, wg, i, n, off: (i - (n - 1) / 2) * wg.spread });
        });
      });
      /* antenna: sottile, curva, con uncino in punta; perno sulla testa */
      const pivot = new THREE.Group();
      pivot.position.set(0.012, 1.35, 0);
      side.add(pivot);
      const ant = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.14, 0.01), new THREE.Vector3(0.12, 0.3, 0.0),
        new THREE.Vector3(0.2, 0.44, -0.02), new THREE.Vector3(0.255, 0.54, -0.02), new THREE.Vector3(0.29, 0.556, -0.01), new THREE.Vector3(0.308, 0.53, 0)
      ]);
      const antGeo = taperedTube(ant, small ? 40 : 64, 7, (t) => 0.011 * (1 - 0.55 * t));
      pivot.add(new THREE.Mesh(antGeo, crystal));
      antennas.push(pivot);
      /* spine sul torace */
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(PET.blade, crystal);
        sp.scale.setScalar(0.12 + i * 0.03);
        sp.position.set(0.03, 1.12 + (i - 1) * 0.07, 0.03);
        sp.rotation.set(0.3, -0.4, 0.3 - i * 0.35);
        side.add(sp);
      }
    });

    /* disco luminoso sotto il piedistallo (come il piatto girevole a led della foto) */
    const ledTex = canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const rings = [[0.56, 48], [0.67, 60], [0.78, 72], [0.89, 84]];
      rings.forEach(([rr, n], ri) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + ri * 0.2;
          const x = w / 2 + (Math.cos(a) * rr * w) / 2, y = h / 2 + (Math.sin(a) * rr * h) / 2;
          const al = 0.6 - ri * 0.12;
          const grd = g.createRadialGradient(x, y, 0, x, y, 3.4);
          grd.addColorStop(0, `rgba(235,242,255,${al})`); grd.addColorStop(1, 'rgba(235,242,255,0)');
          g.fillStyle = grd; g.fillRect(x - 4, y - 4, 8, 8);
        }
      });
      const rg = g.createRadialGradient(w / 2, h / 2, w * 0.22, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(160,170,190,0.10)'); rg.addColorStop(0.8, 'rgba(160,170,190,0.05)'); rg.addColorStop(1, 'rgba(160,170,190,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    const led = floorDecal(ledTex, 1.5, true);
    led.position.y = 0.002;
    root.add(led);
    const halo = floorDecal(radialTexture([[0, 'rgba(120,128,145,0.35)'], [0.5, 'rgba(60,64,75,0.12)'], [1, 'rgba(0,0,0,0)']]), 2.6, true);
    halo.position.y = 0.001;
    root.add(halo);

    /* fondale visto solo dalla trasmissione: una "stanza di posa" con pannello morbido e strisce di luce,
       che la resina piega e spezza. Nel disegno vero non scrive colore (la pagina resta nera). */
    const backTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#050506'; g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.34);
      rg.addColorStop(0, 'rgba(150,156,170,0.9)'); rg.addColorStop(0.55, 'rgba(90,95,108,0.45)'); rg.addColorStop(1, 'rgba(60,64,74,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
      for (const [x, wd, a] of [[0.36, 0.012, 0.9], [0.42, 0.006, 0.7], [0.47, 0.018, 0.55], [0.545, 0.008, 0.85], [0.6, 0.014, 0.75], [0.66, 0.007, 0.6]]) {
        const lg = g.createLinearGradient(w * (x - wd), 0, w * (x + wd), 0);
        lg.addColorStop(0, 'rgba(240,244,252,0)'); lg.addColorStop(0.5, `rgba(240,244,252,${a})`); lg.addColorStop(1, 'rgba(240,244,252,0)');
        g.fillStyle = lg; g.fillRect(w * (x - wd), h * 0.12, w * wd * 2, h * 0.76);
      }
      for (const [y, a] of [[0.34, 0.35], [0.61, 0.28]]) {
        const lg = g.createLinearGradient(0, h * (y - 0.02), 0, h * (y + 0.02));
        lg.addColorStop(0, 'rgba(230,236,248,0)'); lg.addColorStop(0.5, `rgba(230,236,248,${a})`); lg.addColorStop(1, 'rgba(230,236,248,0)');
        g.fillStyle = lg; g.fillRect(w * 0.25, h * (y - 0.02), w * 0.5, h * 0.04);
      }
    });
    const backMat = new THREE.MeshBasicMaterial({ color: 0x050506, toneMapped: false, depthWrite: false });
    const backGlowMat = new THREE.MeshBasicMaterial({ map: backTex, toneMapped: false, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backMat);
    back.scale.set(400, 400, 1); back.position.z = -40;
    const backGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backGlowMat);
    backGlow.scale.set(30, 30, 1); backGlow.position.z = -39;
    for (const b of [back, backGlow]) {
      b.frustumCulled = false;
      b.renderOrder = -20;
      b.onBeforeRender = (r) => { b.material.colorWrite = r.getRenderTarget() !== null; };
      camera.add(b);
    }

    heroes.sculpt = {
      root,
      update(p, t, idle, pointer) {
        const on = p > T.plinthA - 0.005 && p < T.pSinkB + 0.005;
        root.visible = on; back.visible = backGlow.visible = on;
        if (!on) return {};
        const rise = easeOutCubic(seg(p, T.plinthA, T.plinthB)) * (1 - easeInCubic(seg(p, T.pSinkA, T.pSinkB)));
        const em = easeInOutCubic(seg(p, T.emergeA, T.emergeB)) * (1 - easeInCubic(seg(p, T.sSinkA, T.sSinkB)));
        plinth.position.y = -(1 - rise) * (PH + 0.02);
        plinthCut.visible = rise < 1;
        plinthHeat.uCutY.value = 0; plinthHeat.uCutDir.value = -1; plinthHeat.uHeat.value = rise < 1 ? 1 : 0;
        fig.position.y = PH + plinth.position.y - (1 - em) * 1.95;
        emergeClip.constant = em < 1 ? -(PH + plinth.position.y) : 100;
        fig.visible = em > 0.001;
        led.material.opacity = rise * 0.9;
        halo.material.opacity = rise;
        /* ali: si aprono dal basso verso l'alto, lama per lama */
        const wT = seg(p, T.wingA, T.wingB);
        for (const q of petals) {
          const st = q.wg.t * 0.55 + (q.i / q.n) * 0.16;
          const k = easeInOutCubic(seg(wT, st, st + 0.42));
          q.pivot.rotation.z = lerp(q.wg.fold + q.off * 0.12, q.wg.open + q.off, k);
          q.pivot.rotation.y = lerp(0.9, q.wg.sweep, k);
        }
        const ak = easeInOutCubic(seg(wT, 0.5, 1));
        antennas.forEach((a) => { a.rotation.z = lerp(0.5, 0, ak); });
        rimU.uRim.value = 0.9;
        /* giro lento su se stessa */
        const spin = lerp(-0.75, 0.62, seg(p, 0.36, 0.66));
        root.rotation.y = spin + idle * (Math.sin(t * 0.3) * 0.05 + pointer.x * 0.16);
        return {};
      }
    };
  }

  /* =========================== 3 · ZIGZIG LAMP =========================== */
  {
    const root = new THREE.Group();           // punto di sospensione (ruota: oscillazione)
    scene.add(root);
    const ANCHOR = 7, BOT = LAMP_BOT, H = 1.0;     // la lampada va da BOT a BOT+H (mondo)
    root.position.y = ANCHOR;
    const body = new THREE.Group();
    body.position.y = BOT - ANCHOR;
    root.add(body);

    const RIBS = small ? 46 : 60, PER = 4, NT = RIBS * PER, ROWS = small ? 72 : 96, K = 6;
    const DEPTH = 0.15, WALL = 0.01;
    const Rp = (u) => (u < 0.72 ? 0.165 + 0.07 * Math.sin((Math.PI / 2) * (u / 0.72)) : 0.235 - 0.058 * ((u - 0.72) / 0.28) ** 2);
    const RIBP = [1, 0.36, 0, 0.36];           // profilo della costola: cresta sottile, gola larga (lamelle)
    const ribF = (i) => RIBP[((i % PER) + PER) % PER];
    const rOut = (i, u) => Rp(u) * (1 - DEPTH * (1 - ribF(i)));
    const rIn = (u) => Rp(u) * (1 - DEPTH) - WALL;
    /* fessura a zig-zag (centro angolare in funzione della quota, dall'alto in basso):
       lungo la saetta la parete fra una costola e l'altra non c'è, e la luce passa fra le costole */
    const TH0 = Math.PI / 2;                   // davanti (+z)
    const ZIG = [[0.86, 0.2], [0.6, -0.1], [0.5, 0.1], [0.2, -0.16]];
    const slitC = (u) => {
      for (let i = 0; i < ZIG.length - 1; i++) {
        const [ua, ca] = ZIG[i], [ub, cb] = ZIG[i + 1];
        if (u <= ua && u >= ub) return lerp(ca, cb, (ua - u) / (ua - ub));
      }
      return u > ZIG[0][0] ? ZIG[0][1] : ZIG[ZIG.length - 1][1];
    };
    const U0 = 0.2, U1 = 0.86;
    const slitHW = (u) => 0.13 * smoothstep((u - U0) / 0.08) * smoothstep((U1 - u) / 0.08);
    const inZone = (i, j) => {
      const u = (j + 0.5) / ROWS;
      if (u < U0 || u > U1) return false;
      const th = ((i + 0.5) / NT) * TAU;
      return Math.abs(wrapPi(th - (TH0 + slitC(u)))) < slitHW(u);
    };
    const mask = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < NT; i++) { const c = i % PER; mask.push((c === 1 || c === 2) && inZone(i - (c - 1), j)); }
    const cellOpen = (i, j) => mask[j * NT + (((i % NT) + NT) % NT)];

    const vOut = (i, j, out) => { const u = j / ROWS, th = (i / NT) * TAU, r = rOut(i, u); return out.set(Math.cos(th) * r, u * H, Math.sin(th) * r); };
    const vIn = (i, j, out) => { const u = j / ROWS, th = (i / NT) * TAU, r = rIn(u); return out.set(Math.cos(th) * r, u * H, Math.sin(th) * r); };
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
    const a2 = new THREE.Vector3(), b2 = new THREE.Vector3(), c2 = new THREE.Vector3(), d2 = new THREE.Vector3();
    const E1 = new THREE.Vector3(), E2 = new THREE.Vector3(), NN = new THREE.Vector3(), dir = new THREE.Vector3();

    function sliceGeos(ja, jb) {
      const oPos = [], iPos = [], gPos = [], cPos = [];
      const quad = (arr, a, b, c, d) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      /* quad orientato: la normale deve guardare verso dir */
      const quadDir = (arr, a, b, c, d, dv) => {
        E1.subVectors(b, a); E2.subVectors(c, a); NN.crossVectors(E1, E2);
        if (NN.dot(dv) >= 0) quad(arr, a, b, c, d); else quad(arr, a, d, c, b);
      };
      for (let j = ja; j < jb; j++) {
        for (let i = 0; i < NT; i++) {
          if (cellOpen(i, j)) continue;
          const thc = ((i + 0.5) / NT) * TAU;
          vOut(i, j, A); vOut(i + 1, j, B); vOut(i + 1, j + 1, C); vOut(i, j + 1, D);
          quadDir(oPos, A, B, C, D, dir.set(Math.cos(thc), 0, Math.sin(thc)));
          vIn(i, j, a2); vIn(i + 1, j, b2); vIn(i + 1, j + 1, c2); vIn(i, j + 1, d2);
          quadDir(iPos, a2, b2, c2, d2, dir.set(-Math.cos(thc), 0, -Math.sin(thc)));
          /* pareti: sui fianchi della fessura (brillano) e sui tagli delle fette (nere) */
          if (cellOpen(i - 1, j)) quadDir(gPos, A, D, d2, a2, dir.set(Math.sin((i / NT) * TAU), 0, -Math.cos((i / NT) * TAU)));
          if (cellOpen(i + 1, j)) quadDir(gPos, B, C, c2, b2, dir.set(-Math.sin(((i + 1) / NT) * TAU), 0, Math.cos(((i + 1) / NT) * TAU)));
          if (j === ja) quadDir(cPos, A, B, b2, a2, dir.set(0, -1, 0));
          else if (cellOpen(i, j - 1)) quadDir(gPos, A, B, b2, a2, dir.set(0, -1, 0));
          if (j === jb - 1) quadDir(cPos, D, C, c2, d2, dir.set(0, 1, 0));
          else if (cellOpen(i, j + 1)) quadDir(gPos, D, C, c2, d2, dir.set(0, 1, 0));
        }
      }
      const mk = (arr) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        g.computeVertexNormals();
        return layerUV(g, 1.0);
      };
      return { outer: mk(oPos), inner: mk(iPos), glow: mk(gPos), caps: mk(cPos) };
    }

    /* bagliore sulla superficie attorno alla fessura (u = angolo, v = quota) */
    const slitTex = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        const u = 1 - (y + 0.5) / h;
        const hw = slitHW(u);
        if (hw <= 0.001) continue;
        const th = TH0 + slitC(u);
        const cx = ((((th / TAU + 0.5) % 1) + 1) % 1) * w;
        const r = ((hw * 1.9) / TAU) * w;
        const grd = g.createLinearGradient(cx - r, 0, cx + r, 0);
        grd.addColorStop(0, 'rgba(255,190,110,0)'); grd.addColorStop(0.5, 'rgba(255,200,125,1)'); grd.addColorStop(1, 'rgba(255,190,110,0)');
        g.fillStyle = grd; g.fillRect(cx - r, y, r * 2, 1);
      }
    });
    const lampLayers = fineLayers(64);
    const shellMat = mat.matte(0x111113, {
      envMap: envDark, envMapIntensity: 1.25, roughness: 0.34, roughnessMap: lampLayers, bumpMap: lampLayers, bumpScale: 0.25,
      clearcoat: 0.35, clearcoatRoughness: 0.35, flatShading: true,
      emissive: new THREE.Color(0xffae5c), emissiveMap: slitTex, emissiveIntensity: 0
    });
    const capMat = mat.matte(0x151517, { envMap: envDark, envMapIntensity: 0.8, roughness: 0.55, flatShading: true });
    const innerMat = mat.matte(0x2b2622, {
      envMap: envDark, envMapIntensity: 0.3, roughness: 0.75, flatShading: true,
      emissive: new THREE.Color(0xffb35c), emissiveIntensity: 0
    });
    const glowWallMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a), toneMapped: false });
    const slices = [];
    for (let s = 0; s < K; s++) {
      const ja = Math.round((s * ROWS) / K), jb = Math.round(((s + 1) * ROWS) / K);
      const gg = sliceGeos(ja, jb);
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(gg.outer, shellMat), new THREE.Mesh(gg.inner, innerMat), new THREE.Mesh(gg.caps, capMat));
      if (gg.glow.attributes.position.count) grp.add(new THREE.Mesh(gg.glow, glowWallMat));
      body.add(grp);
      slices.push(grp);
    }
    const top = slices[K - 1];
    /* chiusura in alto (disco nero con bordo morbido) */
    const capGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0.05, H - 0.012), new THREE.Vector2(Rp(1) * (1 - DEPTH) + 0.004, H - 0.012), new THREE.Vector2(Rp(1) * (1 - DEPTH) + 0.006, H + 0.002),
      new THREE.Vector2(Rp(1) * (1 - DEPTH) - 0.004, H + 0.011), new THREE.Vector2(0.13, H + 0.014), new THREE.Vector2(0.05, H + 0.014), new THREE.Vector2(0.05, H - 0.012)
    ], 64);
    top.add(new THREE.Mesh(capGeo, shellMat));
    /* portalampada esterno in ceramica chiara + fermacavo + cavo tessile */
    const cupGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.048, 0), new THREE.Vector2(0.054, 0.004), new THREE.Vector2(0.056, 0.012),
      new THREE.Vector2(0.056, 0.066), new THREE.Vector2(0.053, 0.078), new THREE.Vector2(0.044, 0.086), new THREE.Vector2(0.016, 0.09),
      new THREE.Vector2(0, 0.09)
    ], 48);
    const ceramic = mat.matte(0xd8d7d2, { envMap: envDark, envMapIntensity: 1.2, roughness: 0.42, clearcoat: 0.3 });
    const cup = new THREE.Mesh(cupGeo, ceramic);
    cup.position.y = H + 0.012;
    top.add(cup);
    const cableMat = mat.matte(0x34404c, { envMap: envDark, envMapIntensity: 0.9, roughness: 0.72 });
    const relief = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.017, 0.04, 20), cableMat);
    relief.position.y = H + 0.12;
    top.add(relief);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 14, 14, 1, true), cableMat);
    cable.position.y = H + 0.1 + 7;
    top.add(cable);

    /* modulo luce (dentro): portalampada, lampadina LED a filamento, bulbo di vetro.
       Nell'esploso sono tre pezzi separati sull'asse, fra la fetta alta e le altre. */
    const bulb = new THREE.Group();
    bulb.position.y = H * 0.6;
    body.add(bulb);
    const socketG = new THREE.Group(), ledG = new THREE.Group(), glassG = new THREE.Group();
    bulb.add(socketG, ledG, glassG);
    const bakelite = mat.matte(0x19191b, { envMap: envDark, envMapIntensity: 1.1, roughness: 0.38, clearcoat: 0.4 });
    const sockGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0.152), new THREE.Vector2(0.025, 0.152), new THREE.Vector2(0.029, 0.156), new THREE.Vector2(0.029, 0.176),
      new THREE.Vector2(0.034, 0.18), new THREE.Vector2(0.034, 0.19), new THREE.Vector2(0.03, 0.194), new THREE.Vector2(0.03, 0.214),
      new THREE.Vector2(0.034, 0.218), new THREE.Vector2(0.034, 0.228), new THREE.Vector2(0.03, 0.232), new THREE.Vector2(0.03, 0.246),
      new THREE.Vector2(0.024, 0.252), new THREE.Vector2(0.011, 0.254), new THREE.Vector2(0, 0.254)
    ], 32);
    const sock = new THREE.Mesh(sockGeo, bakelite);
    sock.scale.set(1.25, 1, 1.25);
    socketG.add(sock);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.1, 12), cableMat);
    wire.position.y = 0.3;
    socketG.add(wire);
    /* lampadina: attacco E27 in ottone con filetto, collare, stelo e 4 filamenti LED */
    const brass = mat.gold({ envMap: envDark, roughness: 0.22 });
    const e27 = [new THREE.Vector2(0, 0.086), new THREE.Vector2(0.019, 0.086), new THREE.Vector2(0.021, 0.09)];
    for (let i = 0; i < 6; i++) { const y = 0.094 + i * 0.0085; e27.push(new THREE.Vector2(0.0235, y), new THREE.Vector2(0.0205, y + 0.0042)); }
    e27.push(new THREE.Vector2(0.02, 0.146), new THREE.Vector2(0.012, 0.15), new THREE.Vector2(0.006, 0.156), new THREE.Vector2(0, 0.156));
    ledG.add(new THREE.Mesh(new THREE.LatheGeometry(e27, 28), brass));
    const collarMat = mat.matte(0xe9e6df, { envMap: envDark, roughness: 0.4 });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.024, 0.02, 28), collarMat);
    collar.position.y = 0.076;
    ledG.add(collar);
    const stemMat = mat.glass({ envMap: envDark, opacity: 0.35 });
    const stemG = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.07, 10), stemMat);
    stemG.position.y = 0.04;
    ledG.add(stemG);
    const filMat = mat.glow(COLORS.glow);
    const fils = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const pA = new THREE.Vector3(Math.cos(a) * 0.012, 0.062, Math.sin(a) * 0.012);
      const pB = new THREE.Vector3(Math.cos(a + 0.5) * 0.04, 0.012, Math.sin(a + 0.5) * 0.04);
      const pM = pA.clone().lerp(pB, 0.5).multiplyScalar(1.12);
      fils.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(pA, pM, pB), 12, 0.0026, 5));
    }
    ledG.add(new THREE.Mesh(mergeGeometries(fils), filMat));
    const lampLight = new THREE.PointLight(0xffb870, 0, 3.2, 2);
    lampLight.position.y = 0.03;
    ledG.add(lampLight);
    /* bulbo di vetro */
    const glassMat = mat.glass({ envMap: envDark, opacity: 0.24 });
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 20), glassMat);
    glass.scale.set(1, 1.08, 1);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.05, 0.07, 28, 1, true), glassMat);
    neck.position.y = 0.095;
    glassG.add(glass, neck);

    /* bagliori: alone attorno alla fessura, nucleo caldo, pozza di luce a terra, cono di luce sotto */
    const warmTex = radialTexture([[0, 'rgba(255,214,150,1)'], [0.18, 'rgba(255,190,110,0.5)'], [0.5, 'rgba(255,170,90,0.12)'], [1, 'rgba(255,160,80,0)']]);
    const spriteMat = (o) => new THREE.SpriteMaterial({ map: warmTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: o });
    const halo = new THREE.Sprite(spriteMat(0));
    halo.scale.set(1.7, 1.7, 1);
    const core = new THREE.Sprite(spriteMat(0));
    core.scale.set(0.42, 0.66, 1);
    scene.add(halo, core);
    const bulbGlow = new THREE.Sprite(spriteMat(0));
    bulbGlow.scale.set(0.6, 0.6, 1);
    bulbGlow.position.y = 0.03;
    ledG.add(bulbGlow);
    const pool = floorDecal(radialTexture([[0, 'rgba(255,228,178,1)'], [0.14, 'rgba(255,204,136,0.85)'], [0.36, 'rgba(255,172,98,0.28)'], [0.7, 'rgba(255,150,80,0.05)'], [1, 'rgba(255,150,80,0)']]), 2.3, true);
    pool.position.y = 0.002;
    const spill = floorDecal(radialTexture([[0, 'rgba(255,170,100,0.5)'], [0.5, 'rgba(255,150,80,0.12)'], [1, 'rgba(255,140,70,0)']]), 5.2, true);
    spill.position.y = 0.001;
    scene.add(pool, spill);
    /* fascio di luce morbido sotto la lampada: piano sempre girato verso la camera, bordi sfumati */
    const coneTex = canvasTex(128, 128, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const v = y / (h - 1), hw = 0.2 + 0.8 * v, fall = Math.pow(1 - v, 1.6) * (0.35 + 0.65 * smoothstep(v * 6));
        for (let x = 0; x < w; x++) {
          const u = Math.abs((x + 0.5) / w - 0.5) * 2 / hw;
          const a = u >= 1 ? 0 : Math.pow(1 - u * u, 2) * fall;
          const i = (y * w + x) * 4;
          img.data[i] = 255; img.data[i + 1] = 196; img.data[i + 2] = 128; img.data[i + 3] = Math.round(a * 255);
        }
      }
      g.putImageData(img, 0, 0);
    });
    const coneMat = new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const cone = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1).translate(0, -0.5, 0), coneMat);
    cone.renderOrder = 4;
    scene.add(cone);

    /* esploso (quote nel corpo): fette in basso a passo GS, poi vetro, LED, portalampada, fetta alta con il tappo */
    const GS = 0.115, GAP = 0.065;
    const SL = [0, 1, 2, 3, 4].map((s) => -0.3 + s * GS);
    const B0 = H * 0.6;                                             // quota del modulo luce nel corpo
    const dG = (5 / K + SL[4]) + GAP - (B0 - 0.081);               // vetro sopra la fetta 4
    const dL = dG + (B0 + 0.13) + GAP - (B0 + 0.012);               // LED sopra il collo del vetro
    const dS = dL + (B0 + 0.156) + GAP - (B0 + 0.152);              // portalampada sopra l'attacco
    const d5 = dS + (B0 + 0.35) + 0.05 - (5 / K);                   // fetta alta sopra il filo
    LAMP_EXP.top = d5 + H + 0.14;
    LAMP_EXP.bot = SL[0];

    /* materiali che "escono dal buio" all'ingresso */
    const revealMats = [[shellMat, 1.25], [capMat, 0.8], [innerMat, 0.3], [ceramic, 1.2], [cableMat, 0.9], [bakelite, 1.1], [brass, 1.3], [glassMat, 1.6], [collarMat, 0.7]];
    const ceramicBase = new THREE.Color(0xd8d7d2), cableBase = new THREE.Color(0x34404c);

    const slitW = new THREE.Vector3(), camDir = new THREE.Vector3(), WP = new THREE.Vector3();
    heroes.lamp = {
      root,
      update(p, t, idle, pointer) {
        const vis = p > T.dropA - 0.004;
        root.visible = vis; halo.visible = core.visible = pool.visible = spill.visible = cone.visible = vis;
        if (!vis) return { e: 0 };
        const reveal = smoothstep(seg(p, T.dropA, T.dropA + 0.05));
        root.position.y = ANCHOR + lampDrop(p);
        /* oscillazione smorzata dopo la discesa + respiro idle */
        const sw = seg(p, T.dropB - 0.02, T.dropB + 0.1);
        root.rotation.z = 0.02 * Math.sin(sw * Math.PI * 3) * (1 - sw) + idle * Math.sin(t * 0.7) * 0.0025;
        root.rotation.x = idle * Math.sin(t * 0.53 + 1) * 0.002;
        for (const [m, k] of revealMats) { m.envMapIntensity = k * reveal; m.specularIntensity = reveal; }
        shellMat.clearcoat = 0.35 * reveal;
        shellMat.color.setHex(0x111113).multiplyScalar(reveal);
        innerMat.color.setHex(0x2b2622).multiplyScalar(reveal);
        capMat.color.setHex(0x151517).multiplyScalar(reveal);
        ceramic.color.copy(ceramicBase).multiplyScalar(0.15 + 0.85 * reveal);
        cableMat.color.copy(cableBase).multiplyScalar(0.2 + 0.8 * reveal);
        /* accensione con due tremolii */
        const o = seg(p, T.onA, T.onB);
        let lit = smoothstep(o);
        if (o > 0 && o < 0.45) lit *= 0.55 + 0.45 * (Math.sin(o * 70) > 0 ? 1 : 0.25);
        const e = lampE(p);
        /* esploso sfalsato: prima la fetta alta e il modulo luce, poi le fette sotto */
        const ek = (k) => easeInOutCubic(seg(p, T.lexA + k * 0.005, T.lexB + k * 0.005)) * (1 - easeInOutCubic(seg(p, T.lrecA + (7 - k) * 0.003, T.lrecB)));
        slices.forEach((g, s) => {
          const es = ek(s === K - 1 ? 0 : 6 - s);
          g.position.y = (s === K - 1 ? d5 : SL[s]) * es;
          g.rotation.y = (s % 2 ? 1 : -1) * 0.14 * es;
        });
        socketG.position.y = dS * ek(1);
        ledG.position.y = dL * ek(2);
        ledG.rotation.y = ek(2) * 0.8;
        glassG.position.y = dG * ek(3);
        body.rotation.y = lerp(-0.45, 0.4, seg(p, T.dropA, 1)) + idle * pointer.x * 0.14;
        /* intensità */
        shellMat.emissiveIntensity = lit * 0.95;
        innerMat.emissiveIntensity = lit * 0.16;
        glowWallMat.color.setHex(0xffc27a).multiplyScalar(0.06 * reveal + lit * 1.1);
        filMat.color.setHex(COLORS.glow).multiplyScalar(0.12 * reveal + lit * 1.25);
        lampLight.intensity = lit * 1.6;
        /* quanto la fessura guarda la camera */
        slitW.set(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -body.rotation.y);
        camDir.copy(camera.position).setY(0).normalize();
        const face = clamp01(0.3 + 0.7 * slitW.dot(camDir));
        body.getWorldPosition(WP);
        const dy = root.position.y - ANCHOR;
        const cx = WP.x, cy = BOT + H * 0.55 + dy;
        halo.position.set(cx + slitW.x * 0.2, cy + e * 0.45, slitW.z * 0.2);
        core.position.set(cx + slitW.x * 0.26, cy, slitW.z * 0.26);
        halo.material.opacity = lit * (0.45 + 0.3 * e) * face;
        core.material.opacity = lit * 0.5 * face * (1 - e);
        bulbGlow.material.opacity = lit * (0.35 + 0.65 * e);
        const bottom = BOT + dy + SL[0] * ek(6);
        cone.position.set(cx, bottom, 0);
        cone.scale.set(1, Math.max(0.01, bottom), 1);
        cone.rotation.y = Math.atan2(camera.position.x - cx, camera.position.z);
        coneMat.opacity = lit * 0.3 * (1 - 0.5 * e);
        pool.position.x = spill.position.x = cx;
        pool.material.opacity = lit * (0.9 + 0.2 * e);
        spill.material.opacity = lit * 0.55;
        return { e };
      }
    };
  }

  /* =========================== camera e composizione =========================== */
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
  const target = new THREE.Vector3();

  function update(state) {
    const { p, t, w, h, aspect } = state;
    const idle = ctx.reduceMotion ? 0 : 1;
    const pointer = ctx.reduceMotion ? { x: 0, y: 0 } : state.pointer;

    /* pesi dei tre soggetti per camera e luci */
    const wS = 1 - smoothstep(seg(p, 0.342, 0.392));
    const wL = smoothstep(seg(p, 0.652, 0.705));
    const wC = Math.max(0, 1 - wS - wL);
    const eS = stoolE(p), eL = lampE(p), dO = lampDrop(p);
    const revL = smoothstep(seg(p, T.dropA, T.dropA + 0.05));
    const F = [
      { y: 0.64 + 0.42 * eS, H: 1.36 + 0.86 * eS, W: 1.1 + 1.0 * eS, el: 0.27 + 0.05 * eS },
      { y: 1.04, H: 2.18, W: 1.3, el: 0.08 },
      { y: lerp(0.84, LAMP_BOT + (LAMP_EXP.top + LAMP_EXP.bot) / 2, eL) + dO * 0.5,
        H: lerp(1.3, (LAMP_EXP.top - LAMP_EXP.bot) * 0.8, eL) + dO * 0.75, W: 0.95 + 0.2 * eL, el: 0.19 + 0.1 * eL }
    ];
    const mix = (k) => F[0][k] * wS + F[1][k] * wC + F[2][k] * wL;
    const cy = mix('y'), fH = mix('H'), fW = mix('W'), el = mix('el');

    /* composizione: desktop a destra (centro al 72%), mobile nella metà alta (centro al 30%) */
    const kd = smoothstep(seg(aspect, 0.85, 1.05));
    const fh = lerp(0.37, 0.68, kd), fw = lerp(0.84, 0.42, kd);
    const d = Math.max(fH / (fh * tan), fW / (fw * tan * aspect));
    target.set(0, cy, 0);
    camera.position.set(0, cy + Math.sin(el) * d, Math.cos(el) * d);
    camera.lookAt(target);
    camera.setViewOffset(w, h, -kd * 0.22 * w, (1 - kd) * 0.2 * h, w, h);
    camera.updateMatrixWorld();
    heroes.stool.update(p, t, idle, pointer);
    heroes.sculpt.update(p, t, idle, pointer);
    heroes.lamp.update(p, t, idle, pointer);

    /* luci per segmento */
    key.intensity = 2.2 * wS + 2.6 * wC + 1.6 * wL * revL;
    rim.intensity = 1.2 * wS + 4.2 * wC + 3.2 * wL * revL;
    fill.intensity = 0.7 * wS + 0.25 * wC + 0.3 * wL * revL;
  }

  return { scene, camera, update };
}
