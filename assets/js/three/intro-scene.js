/* Tillverka · scena INTRO (sezione #intro, sfondo nero). SPEC §5.1 + §7.
   Il logo come oggetto prezioso: tre pezzi uguali, ognuno fatto di strati veri (dal davanti al dietro):
   cornice in argento vivo, filo d'oro, canale in grafite lucida, piastra di fondo con perni di centraggio.
   I tre pezzi = i tre servizi: scansione (pezzo 0), modellazione (pezzo 1), stampa (pezzo 2).
   Tutte le pose sono funzioni di p; sopra ci sono solo l'ingresso (a tempo, una volta per pagina) e un piccolo moto idle. */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seg, smoothstep, easeInOutCubic, easeOutCubic, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture } from './materials.js';
import { FACE, CHANNEL, OUTLINE, pieceAngle, PIECE_CENTER } from './logo-shape.js';

/* ---------- misure del pezzo (z = profondità, +z verso chi guarda) ---------- */
const DEPTH = 0.24;          // spessore totale
const ZF = DEPTH / 2;        // faccia davanti
const ZS = 0.03;             // giunto fra cornice (davanti) e piastra di fondo (dietro)
const BEV = 0.0075;          // smusso laterale
const BEVT = 0.012;          // smusso in profondità
const RECESS = 0.02;         // profondità del canale incassato
const ZI = ZF - RECESS;      // cima del canale in grafite
const RING_TOP = ZI + 0.0025, RING_H = 0.034;   // filo d'oro
const HALF = OUTLINE / 2;    // metà del filo chiaro attorno al canale (come lo stroke dell'SVG)
const GOLD_W = 0.0072;       // larghezza del filo d'oro
/* spostamento in profondità di ogni strato a esplosione piena (lx = 1): piastra, canale, filo d'oro, cornice.
   Distanze calcolate perché fra uno strato e l'altro resti un vuoto di 0,2 */
const LAYER_OFF = [-0.34, -0.14, 0.0915, 0.364];
const FOV = 30;
const TAN = Math.tan((FOV / 2) * Math.PI / 180);
const LOCK_T = 1.6;          // istante dell'incastro nell'ingresso (dura ~2,4 s in tutto)

/* ---------- piccoli attrezzi ---------- */
const V2 = (x, y) => new THREE.Vector2(x, y);
/* punti del logo (spazio SVG, y in basso) -> spazio three, centrati sul baricentro del pezzo */
const toLocal = (pts) => pts.map(([x, y]) => V2(x - PIECE_CENTER[0], -y - PIECE_CENTER[1]));

/* offset di un poligono chiuso con giunti a spigolo vivo: d > 0 verso l'esterno */
function offsetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a.x * b.y - b.x * a.y; }
  const s = area > 0 ? 1 : -1;
  return pts.map((p1, i) => {
    const p0 = pts[(i - 1 + n) % n], p2 = pts[(i + 1) % n];
    const e1 = p1.clone().sub(p0).normalize(), e2 = p2.clone().sub(p1).normalize();
    const n1 = V2(e1.y * s, -e1.x * s), n2 = V2(e2.y * s, -e2.x * s);
    const m = n1.clone().add(n2).normalize();
    return p1.clone().addScaledVector(m, d / Math.max(0.25, m.dot(n1)));
  });
}

const shapeOf = (pts, holes = []) => {
  const s = new THREE.Shape(pts);
  holes.forEach((h) => s.holes.push(new THREE.Path(h)));
  return s;
};

/* lastra estrusa fra z0 e z1 (smussi compresi) */
function slab(shape, z0, z1, bt, bs, segs) {
  const inner = z1 - z0 - 2 * bt;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: inner, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bs, bevelSegments: segs, curveSegments: 1
  });
  g.translate(0, 0, z0 + bt);
  return g;
}

/* valore interpolato fra fotogrammi chiave [[p, v], ...] (morbido, fermo sulle chiavi) */
function kf(K, p) {
  if (p <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) {
    if (p <= K[i][0]) {
      const a = K[i - 1], b = K[i];
      return lerp(a[1], b[1], smoothstep((p - a[0]) / (b[0] - a[0])));
    }
  }
  return K[K.length - 1][1];
}
const bump = (p, a, b, c, d) => seg(p, a, b) * (1 - seg(p, c, d));
const easeInCubic = (x) => { x = clamp01(x); return x * x * x; };

/* un valore per ogni faccia piana (serve al leggero "tremolio" dei bordi di taglio) */
function addTri(geo, seed = 1) {
  const pos = geo.attributes.position, n = pos.count;
  const a = new Float32Array(n);
  const keys = new Map();
  let s = seed * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), E = new THREE.Vector3();
  const idx = geo.index;
  const at = (i) => (idx ? idx.getX(i) : i);
  const cnt = idx ? idx.count : n;
  for (let i = 0; i < cnt; i += 3) {
    A.fromBufferAttribute(pos, at(i)); B.fromBufferAttribute(pos, at(i + 1)); C.fromBufferAttribute(pos, at(i + 2));
    N.subVectors(C, B).cross(E.subVectors(A, B)).normalize();
    const key = [N.x, N.y, N.z, N.dot(A)].map((v) => Math.round(v * 40)).join(',');
    let v = keys.get(key);
    if (v === undefined) { v = rnd(); keys.set(key, v); }
    a[at(i)] = a[at(i + 1)] = a[at(i + 2)] = v;
  }
  geo.setAttribute('aTri', new THREE.BufferAttribute(a, 1));
  return geo;
}

/* segmento spezzato in tratti corti (il fronte della modellazione li accende uno per uno) */
function pushSeg(arr, ax, ay, az, bx, by, bz, step = 0.035) {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    arr.push(ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0,
      ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1);
  }
}
const loopPoly = (arr, poly, z) => poly.forEach((a, i) => {
  const b = poly[(i + 1) % poly.length];
  pushSeg(arr, a.x, a.y, z, b.x, b.y, z);
});
/* tratteggio "CAD" (isoparametriche) dentro una regione piana: regola pari/dispari sui contorni */
function hatch(arr, polys, z, step, vertical) {
  let lo = Infinity, hi = -Infinity;
  polys.forEach((poly) => poly.forEach((v) => { const c = vertical ? v.x : v.y; lo = Math.min(lo, c); hi = Math.max(hi, c); }));
  for (let c = Math.ceil(lo / step) * step; c < hi; c += step) {
    const xs = [];
    polys.forEach((poly) => poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const ca = vertical ? a.x : a.y, cb = vertical ? b.x : b.y;
      if ((ca <= c) !== (cb <= c)) {
        const t = (c - ca) / (cb - ca);
        xs.push(vertical ? a.y + (b.y - a.y) * t : a.x + (b.x - a.x) * t);
      }
    }));
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (vertical) pushSeg(arr, c, xs[i], z, c, xs[i + 1], z);
      else pushSeg(arr, xs[i], c, z, xs[i + 1], c, z);
    }
  }
}

/* ---------- ambiente riflesso dedicato al logo (tipo HDRI da studio dipinto su tela) ---------- */
/* tela equirettangolare 1024×512: x = 256 guarda verso la camera (+z), 512 = destra (+x), 768 = dietro (−z),
   0 = sinistra (−x); y = 0 zenit, 256 orizzonte. Le facce frontali del logo riflettono l'intorno di (256, 256). */
function paintEnvCanvas() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const soft = (blur, fn) => { g.save(); g.filter = `blur(${blur}px)`; fn(); g.restore(); };
  const vgrad = (x, y, w, h, stops, blur = 0) => soft(blur, () => {
    const lg = g.createLinearGradient(0, y, 0, y + h);
    stops.forEach(([o, col]) => lg.addColorStop(o, col));
    g.fillStyle = lg; g.fillRect(x, y, w, h);
  });
  const line = (x0, y0, x1, y1, w, col, blur) => soft(blur, () => {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  });
  // base: stanza scura
  vgrad(0, 0, W, H, [[0, '#26262a'], [0.5, '#1e1e22'], [0.56, '#0e0e10'], [1, '#08080a']]);
  // emisfero davanti (dietro la camera): cielo chiaro, orizzonte scuro appena inclinato, "terra" grigia
  soft(10, () => {
    const lg = g.createLinearGradient(0, 20, 0, 470);
    lg.addColorStop(0, '#f8f8fa');
    lg.addColorStop(0.5, '#e6e6ea');
    lg.addColorStop(0.58, '#c6c6cb');
    lg.addColorStop(0.63, '#2a2a2e');     // linea d'orizzonte
    lg.addColorStop(0.69, '#6c6c72');
    lg.addColorStop(0.85, '#8a8a90');
    lg.addColorStop(1, '#3a3a3f');
    g.fillStyle = lg;
    g.fillRect(-60, 20, 680, 450);
  });
  // al centro (quello che riflette il logo frontale): una linea obliqua netta e un grigio più profondo sotto
  soft(3, () => {
    const lg = g.createLinearGradient(256, 262, 310, 330);
    lg.addColorStop(0, '#9a9aa0'); lg.addColorStop(1, '#4a4a50');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(130, 360); g.lineTo(400, 360); g.lineTo(400, 168); g.closePath(); g.fill();
  });
  line(130, 360, 400, 168, 5, 'rgba(14,14,16,0.92)', 2);
  // soffitto: softbox
  vgrad(0, -10, W, 56, [[0, '#ffffff'], [1, '#8e8e94']], 10);
  // sottili linee scure oblique nel cielo: scie che scorrono sul cromo quando i pezzi girano
  line(40, 280, 64, 40, 5, 'rgba(20,20,22,0.8)', 2);
  line(172, 250, 196, 40, 5, 'rgba(20,20,22,0.75)', 2);
  line(352, 180, 372, 40, 5, 'rgba(20,20,22,0.75)', 2);
  line(470, 280, 488, 40, 5, 'rgba(20,20,22,0.8)', 2);
  // emisfero dietro: più scuro, softbox e strisce (fianchi scuri con un filo di luce)
  vgrad(586, 70, 50, 220, [[0, '#f0f0f2'], [1, '#77777d']], 5);
  vgrad(690, 90, 160, 200, [[0, '#c4c4c9'], [0.7, '#6e6e74'], [1, '#1e1e22']], 10);
  vgrad(915, 60, 16, 250, [[0, '#ffffff'], [1, '#a0a0a6']], 3);
  // caldi (oro): riflessi dorati sugli smussi e sui fianchi
  soft(12, () => {
    g.fillStyle = 'rgba(255,188,105,0.95)';
    g.fillRect(862, 140, 30, 160);
    g.fillRect(652, 210, 26, 90);
    g.fillRect(150, 30, 80, 14);
  });
  return c;
}

function createLogoEnv(renderer, canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const room = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 96, 48),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
  dome.material.color.setScalar(1.55);
  room.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(room, 0.01);
  pmrem.dispose();
  dome.geometry.dispose(); dome.material.dispose(); tex.dispose();
  return rt;
}

/* fascio di luce dall'alto: trapezio morbido (stretto in alto, largo in basso) */
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 256), d = img.data;
  for (let y = 0; y < 256; y++) {
    const ty = y / 255;
    const hw = lerp(0.14, 1, ty) * 60;
    const va = smoothstep(ty / 0.18) * (1 - smoothstep((ty - 0.62) / 0.38));
    for (let x = 0; x < 128; x++) {
      const dx = (x - 63.5) / hw;
      const v = va * Math.exp(-dx * dx * 2.2) * (0.8 + 0.2 * Math.cos(x * 0.9 + y * 0.05));
      const i = (y * 128 + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.round(255 * Math.min(1, v));
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- shader: taglio (piano o sfera), banda luminosa, strati, riflesso oro, attenuazione, riflesso a terra ---------- */
const FRAG_HEAD = /* glsl */`
varying vec3 vObj; varying vec3 vWp; varying float vTri;
uniform vec4 uClip; uniform float uJit; uniform vec4 uSph;
uniform vec4 uBand; uniform float uBandW; uniform vec3 uBandC; uniform float uBandAmt; uniform float uBandTri; uniform float uBandSph;
uniform float uLayer; uniform float uLayerStep; uniform float uDim; uniform vec3 uFloor;
uniform vec4 uSheen; uniform float uSheenW; uniform float uSheenAmt; uniform vec3 uGold;
float tlkClip() { return dot(uClip.xyz, vObj) + uClip.w + uSph.w * length(vObj - uSph.xyz); }`;
const FRAG_CLIP = /* glsl */`
if (tlkClip() + (vTri - 0.5) * uJit < 0.0) discard;`;
const FRAG_LIGHT = /* glsl */`
{
  float bd = mix(dot(uBand.xyz, vObj) + uBand.w + vTri * uBandTri, tlkClip(), uBandSph);
  if (uLayer > 0.001) {
    float q = dot(uBand.xyz, vObj) / uLayerStep;
    float fw = max(fwidth(q), 1e-4);
    float l = abs(fract(q) - 0.5);
    outgoingLight *= 1.0 - uLayer * smoothstep(0.5 - 0.12 - fw, 0.5, l);
  }
  outgoingLight += uBandC * (uBandAmt * exp(-bd * bd / (uBandW * uBandW)));
  float sd = dot(vWp, uSheen.xyz) - uSheen.w;
  float sh = clamp(uSheenAmt * exp(-sd * sd / (uSheenW * uSheenW)), 0.0, 1.0);
  outgoingLight = mix(outgoingLight, outgoingLight * uGold * 2.4 + uGold * 0.35, sh);
  float fl = uFloor.z > 0.0 ? uFloor.z * step(vWp.y, uFloor.x) * exp(-(uFloor.x - vWp.y) * uFloor.y) : 1.0;
  outgoingLight *= uDim * fl;
}`;

function inject(material, U) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTri;\nvarying vec3 vObj; varying vec3 vWp; varying float vTri;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = transformed; vTri = aTri; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_CLIP)
      .replace('#include <opaque_fragment>', FRAG_LIGHT + '\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'tlk-intro-v2';
  return material;
}

/* ---------- nuvola di punti (scansione) ---------- */
const POINTS_VS = /* glsl */`
attribute float aRnd;
uniform vec4 uPlane; uniform float uSize; uniform float uScale;
varying float vA; varying float vGlow; varying float vRnd;
void main() {
  vec3 p = position + normal * (aRnd - 0.5) * 0.008;
  float d = dot(uPlane.xyz, p) + uPlane.w;
  vA = 1.0 - smoothstep(-0.004, 0.0, d);
  vGlow = exp(-d * d / 0.0009);
  vRnd = aRnd;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uScale / -mv.z * (0.7 + 0.6 * aRnd) * (1.0 + vGlow * 1.2);
  gl_Position = projectionMatrix * mv;
}`;
const POINTS_FS = /* glsl */`
uniform vec3 uColor; uniform vec3 uHot; uniform float uOpacity;
varying float vA; varying float vGlow; varying float vRnd;
void main() {
  if (vA < 0.01) discard;
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.1, r) * vA * uOpacity * (0.55 + 0.45 * vRnd);
  gl_FragColor = vec4(mix(uColor, uHot, vGlow) * a, a);
}`;

/* ---------- fil di ferro della modellazione: davanti al fronte è oro vivo, dietro sparisce nella superficie ---------- */
const WIRE_VS = /* glsl */`
uniform vec4 uFront; uniform float uSize; uniform float uScale;
varying float vF;
void main() {
  vF = length(position - uFront.xyz) - uFront.w;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uScale / -mv.z * (1.0 + 1.6 * exp(-vF * vF / 0.003));
  gl_Position = projectionMatrix * mv;
}`;
const WIRE_FS = /* glsl */`
uniform vec3 uColor; uniform vec3 uHot; uniform float uOpacity; uniform float uAfter; uniform float uRound;
varying float vF;
void main() {
  float m = 1.0;
  if (uRound > 0.5) { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; m = smoothstep(0.5, 0.05, r); }
  float hot = exp(-vF * vF / 0.0025);
  float a = uOpacity * m * (uAfter + (1.0 - uAfter) * smoothstep(-0.05, 0.0, vF) + 1.3 * hot);
  gl_FragColor = vec4(mix(uColor, uHot, clamp(hot, 0.0, 1.0)) * a, a);
}`;

/* ---------- polvere nella luce: più viva dentro il fascio ---------- */
const DUST_VS = /* glsl */`
attribute float aRnd;
uniform float uTime; uniform float uScale; uniform float uSize;
uniform vec2 uBO; uniform vec2 uBD; uniform vec2 uBW;
varying float vTw; varying float vBeam;
void main() {
  vec3 p = position;
  p.y = mod(p.y + 2.4 - uTime * (0.012 + 0.02 * aRnd), 4.8) - 2.4;
  p.x += sin(uTime * 0.21 + aRnd * 40.0) * 0.12;
  p.z += cos(uTime * 0.17 + aRnd * 31.0) * 0.1;
  vec2 r = p.xy - uBO;
  float along = dot(r, uBD);
  float lat = abs(r.x * uBD.y - r.y * uBD.x);
  float hw = uBW.x + max(along, 0.0) * uBW.y;
  vBeam = (1.0 - smoothstep(0.45, 1.0, lat / hw)) * smoothstep(0.0, 0.9, along);
  vTw = 0.45 + 0.55 * sin(uTime * (0.6 + aRnd) + aRnd * 60.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uScale / -mv.z * (0.5 + aRnd) * (1.0 + 0.5 * vBeam);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */`
uniform vec3 uColor; uniform float uOpacity;
varying float vTw; varying float vBeam;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r) * uOpacity * vTw * (0.2 + 1.1 * vBeam);
  gl_FragColor = vec4(uColor * a, a);
}`;

export async function create(ctx) {
  const { renderer, reduceMotion, small } = ctx;
  const query = new URLSearchParams(location.search);
  /* ingresso a tempo: una sola volta per pagina (la scena può essere smontata e rimontata), a orologio vero */
  let skipLoad = reduceMotion || query.has('p') || !!window.__tlkIntroPlayed;
  let loadStart = -1;

  const scene = new THREE.Scene();
  const envCanvas = paintEnvCanvas();
  const envRT = createLogoEnv(renderer, envCanvas);
  scene.environment = envRT.texture;
  let debugBg = null;
  if (query.get('introdebug') === 'env') {   // solo per controllo: mostra l'ambiente
    debugBg = new THREE.CanvasTexture(envCanvas);
    debugBg.mapping = THREE.EquirectangularReflectionMapping;
    debugBg.colorSpace = THREE.SRGBColorSpace;
    scene.background = debugBg;
  }
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, 7);

  /* ---------- geometrie (una volta, condivise dai tre pezzi) ---------- */
  const F = toLocal(FACE), C = toLocal(CHANNEL);
  const Co = offsetPoly(C, HALF);    // bordo esterno del filo chiaro
  const Hc = offsetPoly(C, -HALF);   // canale = foro nella cornice
  const U = [Co[0], Co[1], Co[2], Co[3], Co[4], F[5], F[4], F[3], F[2], F[1], F[0]];   // sagoma intera del pezzo
  const bsg = small ? 3 : 5;
  const frameGeo = slab(shapeOf(U, [Hc]), ZS, ZF, BEVT, BEV, bsg);          // cornice davanti (argento)
  const backGeo = slab(shapeOf(U), -ZF, ZS, BEVT, BEV, bsg);                // piastra di fondo (argento)
  const Hi = offsetPoly(Hc, -(BEV + GOLD_W));                               // canale in grafite
  const Hr = offsetPoly(Hc, -(BEV + 0.0006));                               // filo d'oro: dal muro del foro al canale
  const insGeo = slab(shapeOf(offsetPoly(Hi, -0.002)), ZS, ZI, 0.003, 0.002, 2);
  const ringGeo = slab(shapeOf(Hr, [Hi]), RING_TOP - RING_H, RING_TOP, 0, 0, 1);
  /* perni di centraggio: fissi sulla piastra, entrano nella cornice (si vedono solo nella vista esplosa) */
  const pinGeo = (() => {
    const r = 0.0105, hgt = 0.1, c = 0.0035;
    const prof = [V2(0, -hgt / 2), V2(r - c, -hgt / 2), V2(r, -hgt / 2 + c), V2(r, hgt / 2 - c), V2(r - c, hgt / 2), V2(0, hgt / 2)];
    const parts = [[-0.6, 0.49], [-0.13, 0.47], [0.16, 0.47]].map(([x, y]) => {
      const g = new THREE.LatheGeometry(prof, small ? 10 : 16);
      g.rotateX(Math.PI / 2);
      g.translate(x - PIECE_CENTER[0], -y - PIECE_CENTER[1], ZS + 0.01);
      return g;
    });
    const g = mergeGeometries(parts);
    parts.forEach((q) => q.dispose());
    return g;
  })();
  const LAYER_GEO = [backGeo, insGeo, ringGeo, frameGeo];
  [...LAYER_GEO, pinGeo].forEach((g, i) => { addTri(g, i + 3); g.computeBoundingBox(); });
  const bb = backGeo.boundingBox;

  /* fil di ferro "CAD" per la modellazione (spazio del pezzo): contorni di ogni strato, spigoli, tratteggio, nodi */
  const Uo = offsetPoly(U, 0.003), Ho = offsetPoly(Hc, -0.003);
  const zf = ZF + 0.003;
  const wirePts = [], gridPts = [], knotPts = [];
  loopPoly(wirePts, Uo, zf); loopPoly(wirePts, Uo, -zf); loopPoly(wirePts, Uo, ZS);
  loopPoly(wirePts, Ho, zf); loopPoly(wirePts, Ho, ZS + 0.003);
  loopPoly(wirePts, offsetPoly(Hi, -0.002), ZI + 0.002);
  Uo.forEach((a) => { pushSeg(wirePts, a.x, a.y, -zf, a.x, a.y, zf); knotPts.push(a.x, a.y, zf, a.x, a.y, -zf, a.x, a.y, ZS); });
  Ho.forEach((a) => { pushSeg(wirePts, a.x, a.y, ZS + 0.003, a.x, a.y, zf); knotPts.push(a.x, a.y, zf); });
  hatch(gridPts, [U, Hc], ZF + 0.0015, 0.045, false);
  hatch(gridPts, [U, Hc], ZF + 0.0015, 0.045, true);
  const lineGeo = (arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  };
  const wireGeo = lineGeo(wirePts), gridGeo = lineGeo(gridPts), knotGeo = lineGeo(knotPts);
  // il fronte parte dalla punta sinistra del pezzo, davanti
  let tip = U[0];
  U.forEach((a) => { if (a.x < tip.x) tip = a; });
  const FRONT_C = new THREE.Vector3(tip.x, tip.y, ZF);
  let FRONT_R = 0;
  U.forEach((a) => { FRONT_R = Math.max(FRONT_R, Math.hypot(a.x - tip.x, a.y - tip.y, DEPTH)); });
  FRONT_R += 0.06;

  /* nuvola di punti per la scansione (campionata sulla superficie vera) */
  const cloudGeo = (() => {
    const N = small ? 3400 : 6800;
    const parts = [[frameGeo, 0.42], [backGeo, 0.4], [insGeo, 0.18]];
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), rnd = new Float32Array(N);
    const tp = new THREE.Vector3(), tn = new THREE.Vector3();
    let i = 0;
    parts.forEach(([geo, share], j) => {
      const n = j === parts.length - 1 ? N - i : Math.round(N * share);
      const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).build();
      for (let m = 0; m < n; m++, i++) {
        sampler.sample(tp, tn);
        pos.set([tp.x, tp.y, tp.z], i * 3);
        nor.set([tn.x, tn.y, tn.z], i * 3);
        rnd[i] = Math.random();
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    return g;
  })();

  /* ---------- riflesso oro condiviso (lampo all'incastro) ---------- */
  const SHEEN = {
    uSheen: { value: new THREE.Vector4(0.83, 0.56, 0, -9) },
    uSheenW: { value: 0.32 },
    uSheenAmt: { value: 0 },
    uGold: { value: new THREE.Color(COLORS.gold) }
  };
  const mkU = () => ({
    uClip: { value: new THREE.Vector4(0, 0, 0, 1) }, uJit: { value: 0 }, uSph: { value: new THREE.Vector4(0, 0, 0, 0) },
    uBand: { value: new THREE.Vector4(0, 1, 0, 0) }, uBandW: { value: 0.01 },
    uBandC: { value: new THREE.Color(COLORS.glow) }, uBandAmt: { value: 0 }, uBandTri: { value: 0 }, uBandSph: { value: 0 },
    uLayer: { value: 0 }, uLayerStep: { value: 0.0125 }, uDim: { value: 1 }, uFloor: { value: new THREE.Vector3(0, 0, 0) },
    ...SHEEN
  });

  /* ---------- scena ---------- */
  const rig = new THREE.Group();          // composizione + idle
  scene.add(rig);
  const logo = new THREE.Group();         // rotazione del logo attorno al suo centro (triscele)
  logo.position.set(0.013, -0.1465, 0);   // centro visivo del logo nell'origine
  rig.add(logo);

  const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
  const goldGlow = (opacity) => new THREE.MeshBasicMaterial({
    map: glowTex, color: COLORS.gold, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false
  });
  const unitPlane = new THREE.PlaneGeometry(1, 1);

  const silverOpts = { roughness: 0.055 };
  const graphiteOpts = { color: 0x0e0f11, metalness: 0.5, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.8 };
  const goldOpts = { roughness: 0.14, envMapIntensity: 1.6 };

  const pieces = [0, 1, 2].map((k) => {
    const u = mkU();
    const silver = inject(mat.liquidSilver(silverOpts), u);
    const graphite = inject(mat.graphite(graphiteOpts), u);
    const gold = inject(mat.gold(goldOpts), u);
    const pinMat = inject(mat.gold({ roughness: 0.22, envMapIntensity: 1.4 }), u);
    const capMat = inject(new THREE.MeshBasicMaterial({ color: 0x1b1c1f, side: THREE.BackSide, toneMapped: false }), u);
    const g = new THREE.Group();          // posa del pezzo
    const layers = LAYER_GEO.map((geo, i) => {
      const L = new THREE.Mesh(geo, [silver, graphite, gold, silver][i]);
      const cap = new THREE.Mesh(geo, capMat);
      cap.visible = false;
      L.add(cap);
      L.userData.cap = cap;
      g.add(L);
      return L;
    });
    const pins = new THREE.Mesh(pinGeo, pinMat);
    layers[0].add(pins);
    const snap = new THREE.Mesh(unitPlane, goldGlow(0));
    snap.scale.setScalar(1.35);
    snap.position.z = ZF + 0.05;
    snap.visible = false;
    g.add(snap);
    logo.add(g);
    const angle = pieceAngle(k);
    const c = new THREE.Vector3(PIECE_CENTER[0], PIECE_CENTER[1], 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    return { k, g, u, silver, graphite, gold, capMat, layers, pins, snap, angle, center: c, dir: c.clone().normalize() };
  });
  const setCaps = (P, v) => { for (const L of P.layers) L.userData.cap.visible = v; };

  /* pezzo 0 · scansione: piano laser + nuvola di punti */
  const P0 = pieces[0];
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: POINTS_VS, fragmentShader: POINTS_FS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPlane: { value: new THREE.Vector4(1, 0, 0, 9) }, uSize: { value: 0.0105 }, uScale: { value: 800 },
      uColor: { value: new THREE.Color(0xf3e3bd) }, uHot: { value: new THREE.Color(0xd8f08c) }, uOpacity: { value: 0 }
    }
  });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  cloud.frustumCulled = false;
  P0.g.add(cloud);
  // ventaglio laser: parte da un emettitore sopra il pezzo e si apre verso il basso (piano x = costante)
  const LASER_TOP = bb.max.y + 0.42, LASER_BOT = bb.min.y - 0.1, LASER_HALF = DEPTH / 2 + 0.22;
  const laserTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    const vg = g.createLinearGradient(0, 0, 0, 256);
    vg.addColorStop(0, 'rgba(255,255,255,0.9)'); vg.addColorStop(0.55, 'rgba(255,255,255,0.35)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = vg; g.fillRect(0, 0, 128, 256);
    g.globalCompositeOperation = 'destination-in';
    const hg = g.createLinearGradient(0, 0, 128, 0);
    hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.2, 'rgba(0,0,0,0.55)'); hg.addColorStop(0.5, 'rgba(0,0,0,1)');
    hg.addColorStop(0.8, 'rgba(0,0,0,0.55)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg; g.fillRect(0, 0, 128, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const laserGeo = new THREE.BufferGeometry();
  laserGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, LASER_TOP, 0, 0, LASER_BOT, LASER_HALF, 0, LASER_BOT, -LASER_HALF], 3));
  laserGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 1, 1, 0, 0, 0], 2));
  const laserMat = new THREE.MeshBasicMaterial({
    map: laserTex, color: 0xb9dc6a, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const laser = new THREE.Mesh(laserGeo, laserMat);
  P0.g.add(laser);
  const emitter = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xe6f7b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }));
  P0.g.add(emitter);

  /* pezzo 1 · modellazione: fil di ferro oro + tratteggio + nodi, poi la superficie si chiude */
  const P1 = pieces[1];
  const FRONT = { value: new THREE.Vector4(FRONT_C.x, FRONT_C.y, FRONT_C.z, -1) };
  const WSCALE = { value: 800 };
  const wireShader = (color, hot, round, size) => new THREE.ShaderMaterial({
    vertexShader: WIRE_VS, fragmentShader: WIRE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uFront: FRONT, uScale: WSCALE, uSize: { value: size }, uRound: { value: round ? 1 : 0 },
      uColor: { value: new THREE.Color(color) }, uHot: { value: new THREE.Color(hot) }, uOpacity: { value: 0 }, uAfter: { value: 1 }
    }
  });
  const wireMat = wireShader(0xe8c47e, 0xfff3d6, false, 0);
  const gridMat = wireShader(0xb89458, 0xffe2a6, false, 0);
  const knotMat = wireShader(0xffe7b3, 0xffffff, true, small ? 0.018 : 0.015);
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  const knots = new THREE.Points(knotGeo, knotMat);
  [wire, grid, knots].forEach((o) => { o.frustumCulled = false; o.visible = false; P1.g.add(o); });

  /* pezzo 2 · stampa: la sezione appena stampata brilla */
  const P2 = pieces[2];
  const printSpark = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), goldGlow(0.9));
  P2.g.add(printSpark);

  /* ---------- riflesso a terra: copia specchiata dei pezzi, scura e sfumata ---------- */
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  scene.add(mirror);
  const mRig = new THREE.Group(), mLogo = new THREE.Group();
  mirror.add(mRig); mRig.add(mLogo);
  const pairs = [[rig, mRig], [logo, mLogo]];
  const FLOOR = new THREE.Vector3(-1, 4.2, 0.12);     // quota, attenuazione, intensità
  pieces.forEach((P) => {
    const uM = { ...P.u, uDim: { value: 1 }, uFloor: { value: FLOOR } };
    P.mU = uM;
    const mm = [inject(mat.liquidSilver(silverOpts), uM), inject(mat.graphite(graphiteOpts), uM), inject(mat.gold(goldOpts), uM)];
    const mg = new THREE.Group();
    mLogo.add(mg);
    pairs.push([P.g, mg]);
    P.layers.forEach((L, i) => {
      const m = new THREE.Mesh(L.geometry, mm[[0, 1, 2, 0][i]]);
      mg.add(m);
      pairs.push([L, m]);
    });
  });
  const floorFade = { value: 0 };

  /* ---------- atmosfera: alone dietro, fascio di luce, pozza di luce a terra, polvere, lampo ---------- */
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(120,112,98,0.55)'], [0.35, 'rgba(60,56,50,0.22)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.5
  }));
  halo.position.z = -2.6;
  rig.add(halo);
  // fascio: dall'alto a sinistra verso il logo
  const BEAM_O = new THREE.Vector2(-0.75, 3.3), BEAM_END = new THREE.Vector2(0.15, -1.2);
  const BEAM_D = BEAM_END.clone().sub(BEAM_O), BEAM_L = BEAM_D.length();
  BEAM_D.normalize();
  const BEAM_W0 = 0.1, BEAM_W1 = 1.05;
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2 * BEAM_W1, BEAM_L), new THREE.MeshBasicMaterial({
    map: beamTexture(), color: 0xfff0d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    toneMapped: false, opacity: 0
  }));
  beam.position.set(BEAM_O.x + BEAM_D.x * BEAM_L / 2, BEAM_O.y + BEAM_D.y * BEAM_L / 2, -1.1);
  beam.rotation.z = Math.atan2(BEAM_D.x, -BEAM_D.y);
  scene.add(beam);
  const pool = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(236,208,143,0.9)'], [0.3, 'rgba(217,179,106,0.35)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.22
  }));
  pool.scale.set(2.8, 0.3, 1);
  scene.add(pool);
  const flash = new THREE.Mesh(unitPlane, goldGlow(0));
  flash.scale.setScalar(3.4);
  flash.position.z = 0.4;
  rig.add(flash);

  const nDust = small ? 170 : 340;
  const dustGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(nDust * 3), rnd = new Float32Array(nDust);
    for (let i = 0; i < nDust; i++) {
      // metà della polvere nasce dentro il fascio: si vede la luce
      const inBeam = i % 2 === 0;
      if (inBeam) {
        const a = Math.random() * BEAM_L, s = (Math.random() - 0.5) * 2 * lerp(BEAM_W0, BEAM_W1, a / BEAM_L) * 0.7;
        pos[i * 3] = BEAM_O.x + BEAM_D.x * a - BEAM_D.y * s;
        pos[i * 3 + 1] = BEAM_O.y + BEAM_D.y * a + BEAM_D.x * s;
      } else {
        pos[i * 3] = (Math.random() - 0.5) * 6.4;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 4.8;
      }
      pos[i * 3 + 2] = -2.2 + Math.random() * 3.2;
      rnd[i] = Math.random();
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  }
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uScale: { value: 800 }, uSize: { value: 0.011 }, uColor: { value: new THREE.Color(0xf6e6c2) }, uOpacity: { value: 0 },
      uBO: { value: BEAM_O }, uBD: { value: BEAM_D }, uBW: { value: new THREE.Vector2(BEAM_W0, (BEAM_W1 - BEAM_W0) / BEAM_L) }
    }
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  /* luci: il cromo vive dell'ambiente riflesso; resta solo un controluce oro (bagliori sugli smussi) */
  const rim = new THREE.DirectionalLight(0xffd79a, 2.0); rim.position.set(3.5, 2.8, -4);
  scene.add(rim);

  /* ---------- tempi (p) ---------- */
  // orientamento del logo: 3/4 nel NOME, vista esplosa inclinata nella MISSIONE, 3/4 nella ricomposizione, poi frontale
  const YAW = [[0, 0], [0.12, 0], [0.225, -0.62], [0.305, -0.95], [0.385, -0.88], [0.435, -0.06], [0.72, 0.02], [0.8, 0.3], [0.862, -0.95], [0.93, -0.8], [0.968, 0], [1, 0]];
  const PITCH = [[0, 0], [0.12, 0], [0.225, 0.1], [0.305, 0.2], [0.385, 0.18], [0.435, 0.04], [0.72, 0.04], [0.8, 0.06], [0.862, 0.2], [0.93, 0.16], [0.968, 0], [1, 0]];
  // esplosione radiale (i pezzi si allontanano dal centro)
  const EX = [[0, 0], [0.262, 0], [0.33, 1], [0.72, 1], [0.8, 0.6], [0.858, 1.2], [0.912, 0], [1, 0]];
  // esplosione degli strati: missione (a scalare pezzo per pezzo) e ricomposizione
  const LXM = [[0.298, 0], [0.345, 1], [0.382, 1], [0.41, 0]];
  const LXV = [[0.79, 0], [0.855, 1.15]];
  const SNAP0 = 0.906, SNAPD = 0.013, SNAPL = 0.014;   // scatti di chiusura degli strati, uno per pezzo
  const TILT = [0.14, -0.12, 0.1];                     // inclinazione di ogni pezzo sul suo raggio nella vista esplosa
  const PRESENT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, -0.42, 0, 'YXZ'));
  const Z = new THREE.Vector3(0, 0, 1);
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion();
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), axis = new THREE.Vector3();
  const presentPos = new THREE.Vector3(0.05, 0.05, 0.95);
  const outDir = new THREE.Vector3();
  const goldCol = new THREE.Color(COLORS.gold);

  /* peso "in primo piano" dei pezzi nei tre pilastri */
  const feat = (k, p) => {
    const a = 0.42 + k * 0.1;
    return easeInOutCubic(seg(p, a - 0.005, a + 0.03)) * (1 - easeInOutCubic(seg(p, a + 0.093, a + 0.125)));
  };
  /* lampo a un istante: attacco secco, coda morbida */
  const ping = (x, at, up, down) => (x < at ? Math.exp(-Math.pow((x - at) / up, 2)) : Math.exp(-Math.pow((x - at) / down, 2)));

  return {
    scene, camera,
    resize() {},
    update(s) {
      const { p, t, pointer, w, h, aspect } = s;
      const idle = reduceMotion ? 0 : 1;

      /* --- ingresso a tempo (orologio vero): parte al primo fotogramma dopo la precompilazione --- */
      if (!skipLoad && loadStart < 0 && t > 0) {
        if (s.pRaw > 0.1) skipLoad = true;          // pagina già scorsa oltre la hero: niente ingresso
        else loadStart = performance.now();
        window.__tlkIntroPlayed = true;
      }
      const lt = skipLoad ? 99 : loadStart < 0 ? 0 : (performance.now() - loadStart) / 1000;
      const lockFlash = skipLoad ? 0 : Math.exp(-Math.pow((lt - LOCK_T - 0.05) / 0.16, 2));

      /* --- fasi --- */
      const ex = kf(EX, p);
      const orb = easeInOutCubic(seg(p, 0.72, 0.9)) * (Math.PI * 2 / 3);
      const pillar = easeInOutCubic(seg(p, 0.4, 0.44)) * (1 - easeInOutCubic(seg(p, 0.705, 0.76)));
      const visionBump = Math.sin(Math.PI * seg(p, 0.72, 0.9));
      const lxV = kf(LXV, p);

      /* --- logo: orientamento globale + idle --- */
      const heroW = 1 - smoothstep(seg(p, 0.1, 0.16)) + smoothstep(seg(p, 0.93, 0.98));
      const yawIdle = idle * (Math.sin(t * 0.42) * 0.17 * (0.35 + 0.65 * heroW) + pointer.x * 0.14);
      const pitchIdle = idle * (Math.sin(t * 0.31 + 1.3) * 0.035 - pointer.y * 0.09);
      logo.rotation.set(kf(PITCH, p), kf(YAW, p), 0, 'YXZ');
      rig.rotation.set(pitchIdle, yawIdle, 0, 'YXZ');
      rig.position.y = idle * Math.sin(t * 0.9) * 0.022;

      /* --- pezzi --- */
      let lxMax = 0;
      for (const P of pieces) {
        const { k, g, u } = P;
        const f = feat(k, p);
        // strati: missione + ricomposizione (chiusura a scatto, pezzo dopo pezzo)
        const sk = easeInCubic(seg(p, SNAP0 + SNAPD * k, SNAP0 + SNAPD * k + SNAPL));
        let lx = kf(LXM, p - 0.009 * k) + lxV * (1 - sk);
        lxMax = Math.max(lxMax, lx);
        // ingresso: gli strati viaggiano aperti e si chiudono nell'istante dell'incastro
        if (!skipLoad && lt < LOCK_T) lx += 0.85 * (1 - easeInCubic((lt - 0.45 - 0.1 * k) / (LOCK_T - 0.45 - 0.1 * k)));
        for (let i = 0; i < 4; i++) P.layers[i].position.z = LAYER_OFF[i] * lx;
        P.pins.visible = lx > 0.004;
        // posizione nell'incastro, esplosa e fatta orbitare
        vA.copy(P.center).addScaledVector(P.dir, 0.38 * ex);
        vA.z += (k - 1) * 0.12 * ex;
        vA.applyAxisAngle(Z, orb);
        // gli altri pezzi arretrano durante i pilastri
        const back = pillar * (1 - f);
        outDir.copy(P.dir).applyAxisAngle(Z, orb);
        vA.addScaledVector(outDir, 0.1 * back);
        vA.z -= 3.2 * back;
        vB.copy(presentPos);
        g.position.copy(vA).lerp(vB, f);
        // rotazione: nel logo + inclinazione sul raggio (mostra la pila di strati), verso la "presentazione" nei pilastri
        qA.setFromAxisAngle(Z, P.angle + orb);
        axis.copy(P.dir).applyAxisAngle(Z, orb);
        qB.setFromAxisAngle(axis, (TILT[k] + (p - 0.33) * 0.5 * Math.sign(TILT[k])) * Math.min(1, ex) * (1 - pillar));
        qA.premultiply(qB);
        qA.slerp(PRESENT, f);
        // ingresso: arrivano da fuori campo ruotando
        const e = skipLoad ? 1 : easeOutCubic((lt - 0.1 - 0.12 * k) / (LOCK_T - 0.1 - 0.12 * k));
        if (e < 1) {
          const r = 1 - e;
          g.position.addScaledVector(P.dir, 3.6 * r);
          g.position.z += 2.2 * r * r;
          axis.set(P.dir.y, -P.dir.x, 0.7).normalize();
          qC.setFromAxisAngle(axis, 2.8 * r);
          qA.premultiply(qC);
        }
        g.quaternion.copy(qA);
        u.uDim.value = 1 - 0.965 * back;
        P.mU.uDim.value = u.uDim.value;
        // effetti spenti di base
        u.uClip.value.set(0, 0, 0, 1);
        u.uSph.value.w = 0;
        u.uJit.value = 0;
        u.uBandAmt.value = 0;
        u.uBandTri.value = 0;
        u.uBandSph.value = 0;
        u.uLayer.value = 0;
        setCaps(P, false);
        // lampo d'oro allo scatto degli strati (e all'incastro dell'ingresso)
        const fk = Math.max(ping(p, SNAP0 + SNAPD * k + SNAPL, 0.002, 0.009), lockFlash * 0.7);
        P.snap.material.opacity = 0.7 * fk;
        P.snap.visible = fk > 0.004;
        P.gold.emissive.copy(goldCol).multiplyScalar(1.6 * fk);
      }

      /* --- pilastro 1: scansione del pezzo 0 --- */
      {
        const u = P0.u;
        const fwd = easeInOutCubic(seg(p, 0.435, 0.505));
        const ret = easeInOutCubic(seg(p, 0.515, 0.565));
        const x0 = bb.min.x - 0.02, x1 = bb.max.x + 0.02;
        const xs = lerp(x0, x1, fwd * (1 - ret));
        const active = xs > x0 + 1e-4 && xs < x1 - 1e-4;
        u.uClip.value.set(1, 0, 0, -xs);
        const la = bump(p, 0.428, 0.442, 0.498, 0.512);
        u.uBand.value.set(1, 0, 0, -xs);
        u.uBandW.value = 0.006;
        u.uBandC.value.setHex(0xcde98a);
        u.uBandAmt.value = 3.2 * la;
        P0.capMat.color.setRGB(0.1, 0.13, 0.05);
        setCaps(P0, active);
        cloudMat.uniforms.uPlane.value.set(1, 0, 0, -xs);
        cloudMat.uniforms.uOpacity.value = active ? 1 : 0;
        cloud.visible = active;
        laser.position.x = xs;
        laserMat.opacity = 0.42 * la;
        emitter.position.set(xs, LASER_TOP, 0);
        emitter.material.opacity = la;
        laser.visible = emitter.visible = la > 0.001;
      }

      /* --- pilastro 2: modellazione del pezzo 1 (fil di ferro d'oro che si riempie di cromo) --- */
      {
        const u = P1.u;
        const back1 = pillar * (1 - feat(1, p));
        const wa = seg(p, 0.498, 0.53) * (1 - seg(p, 0.604, 0.618));
        const fill = easeInOutCubic(seg(p, 0.553, 0.603));
        const modelling = p > 0.499 && p < 0.62;
        const r = lerp(-0.03, FRONT_R, fill);
        FRONT.value.w = r;
        if (modelling) {
          // solido visibile solo dentro la sfera del fronte; il fronte brilla d'oro
          u.uClip.value.set(0, 0, 0, r);
          u.uSph.value.set(FRONT_C.x, FRONT_C.y, FRONT_C.z, -1);
          u.uBandSph.value = 1;
          u.uBandW.value = 0.03;
          u.uBandC.value.setHex(0xffc978);
          u.uBandAmt.value = 1.2 * bump(p, 0.553, 0.562, 0.596, 0.608);
          P1.capMat.color.setRGB(0.62, 0.44, 0.17);
          setCaps(P1, fill > 0 && fill < 1);
        }
        const after = 0.16 * (1 - seg(p, 0.596, 0.612));
        wireMat.uniforms.uOpacity.value = 0.95 * wa * (1 - 0.85 * back1);
        gridMat.uniforms.uOpacity.value = 0.4 * wa * (1 - 0.85 * back1);
        knotMat.uniforms.uOpacity.value = 1.0 * wa * (1 - 0.85 * back1);
        wireMat.uniforms.uAfter.value = gridMat.uniforms.uAfter.value = knotMat.uniforms.uAfter.value = after;
        wire.visible = grid.visible = knots.visible = wa > 0.001;
      }

      /* --- pilastro 3: stampa del pezzo 2 --- */
      {
        const u = P2.u;
        const y0 = bb.min.y - 0.01, y1 = bb.max.y + 0.012;
        const un = easeInOutCubic(seg(p, 0.585, 0.618));
        const pr = seg(p, 0.628, 0.705);
        const step = u.uLayerStep.value;
        let hgt;
        if (p < 0.622) hgt = lerp(y1, y0, un);
        else hgt = y0 + Math.ceil((pr * (y1 - y0)) / step) * step;
        const active = hgt < y1 - 1e-4;
        u.uClip.value.set(0, -1, 0, hgt);
        u.uBand.value.set(0, 1, 0, -hgt);
        u.uBandW.value = 0.016;
        u.uBandC.value.setHex(0xffc978);
        u.uBandAmt.value = 1.6 * (active ? bump(p, 0.62, 0.635, 0.69, 0.71) : 0);
        u.uLayer.value = 0.2 * bump(p, 0.62, 0.64, 0.75, 0.8);
        P2.capMat.color.setRGB(1.0, 0.72, 0.36);
        setCaps(P2, active && p > 0.622);
        printSpark.visible = active && pr > 0 && pr < 1;
        printSpark.position.set(lerp(bb.min.x + 0.1, bb.max.x - 0.1, 0.5 + 0.5 * Math.sin(pr * 60)), hgt, DEPTH / 2 + 0.01);
      }

      /* --- riflesso oro: all'incastro dell'ingresso e alla fine della ricomposizione --- */
      {
        const lt2 = (lt - (LOCK_T - 0.12)) / 1.0;
        const r2 = seg(p, 0.952, 0.992);
        let pos = -9, amt = 0;
        if (lt2 > 0 && lt2 < 1) { pos = lerp(-1.7, 1.7, easeInOutCubic(lt2)); amt = Math.sin(Math.PI * lt2); }
        if (r2 > 0 && r2 < 1) { pos = lerp(-1.7, 1.7, easeInOutCubic(r2)); amt = Math.sin(Math.PI * r2); }
        SHEEN.uSheen.value.w = pos;
        SHEEN.uSheenAmt.value = 0.85 * amt;
      }
      const endFlash = ping(p, SNAP0 + 2 * SNAPD + SNAPL, 0.003, 0.012);
      flash.material.opacity = Math.max(0.34 * lockFlash, 0.2 * endFlash);
      flash.visible = flash.material.opacity > 0.002;

      /* --- atmosfera --- */
      const intro = skipLoad ? 1 : smoothstep((lt - 0.2) / 1.6);
      halo.material.opacity = 0.5 * intro * (1 - 0.35 * pillar);
      beam.material.opacity = 0.075 * intro * (1 - 0.7 * pillar);
      dustMat.uniforms.uTime.value = reduceMotion ? 0 : t;
      dustMat.uniforms.uOpacity.value = 0.6 * intro;
      // pavimento: appena sotto il punto più basso (scende quando il logo si apre)
      const floorY = -0.9 - 0.42 * ex - 0.14 * lxMax;
      pool.position.set(0, floorY + 0.01, 0);
      pool.material.opacity = 0.2 * intro * (1 - 0.5 * Math.min(1, ex)) * (1 - pillar);
      // riflesso: acceso nella hero, nel nome, nella visione e nel finale; spento nei pilastri
      floorFade.value = (skipLoad ? 1 : smoothstep((lt - 1.25) / 0.6)) * (1 - bump(p, 0.36, 0.41, 0.73, 0.79));
      FLOOR.set(floorY, 4.2, 0.12 * floorFade.value);
      mirror.visible = floorFade.value > 0.004;
      if (mirror.visible) {
        mirror.position.y = 2 * floorY;
        for (let i = 0; i < pairs.length; i++) {
          const a = pairs[i][0], b = pairs[i][1];
          b.position.copy(a.position); b.quaternion.copy(a.quaternion); b.scale.copy(a.scale); b.visible = a.visible;
        }
      }

      /* --- composizione: centro ottico e distanza della camera --- */
      const wide = smoothstep((aspect - 0.8) / 0.3);
      const side = easeInOutCubic(seg(p, 0.1, 0.155)) * (1 - easeInOutCubic(seg(p, 0.87, 0.915)));
      const cx = 0.22 * side * wide;
      const cy = lerp(-0.2, lerp(-0.14, 0, side), wide);
      const rpxDesk = lerp(Math.min(0.29 * h, 0.2 * w), Math.min(0.235 * w, 0.4 * h), side);
      const rpxMob = Math.min(0.43 * w, 0.2 * h);
      const rpx = lerp(rpxMob, rpxDesk, wide);
      const R = (1.0 + 0.3 * ex + 0.25 * lxMax) * (1 - 0.34 * pillar);
      const dist = (R * (h / 2)) / (rpx * TAN) * (1 + 0.15 * visionBump);
      camera.position.set(0, 0, dist);
      camera.lookAt(0, 0, 0);
      camera.setViewOffset(w, h, -cx * w, -cy * h, w, h);
      const scale = (h * renderer.getPixelRatio()) / (2 * TAN);
      cloudMat.uniforms.uScale.value = scale;
      dustMat.uniforms.uScale.value = scale;
      WSCALE.value = scale;
      // i bagliori guardano sempre la camera
      flash.quaternion.copy(camera.quaternion);
      P2.g.getWorldQuaternion(qC);
      printSpark.quaternion.copy(qC).invert().multiply(camera.quaternion);
      P0.g.getWorldQuaternion(qC);
      emitter.quaternion.copy(qC).invert().multiply(camera.quaternion);
      for (const P of pieces) {
        if (!P.snap.visible) continue;
        P.g.getWorldQuaternion(qC);
        P.snap.quaternion.copy(qC).invert().multiply(camera.quaternion);
      }
    },
    dispose() {
      // quello che il core non raggiunge: l'ambiente dedicato e lo sfondo di prova
      envRT.dispose();
      debugBg?.dispose();
    }
  };
}
