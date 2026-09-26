/* Tillverka · scena "tech" (#tecnologie, sfondo bianco): tre tecnologie, tre viste esplose.
   1) FDM   p 0.00–0.33  hotend in sezione (macro): esplode lungo il suo asse; poi il filamento bambù entra,
            fonde (bagliore oro) e stende un cordolo sul piatto disegnando il logo
   2) MSLA  p 0.33–0.66  stampante a resina esplosa (coperchio ambra, vasca, pellicola, LCD con la fetta,
            matrice UV, asse Z); poi stampa di un pezzo trasparente appeso a testa in giù
   3) MJF   p 0.66–1.00  blocco di polvere di nylon 12 soffiato via: svela i pezzi grigi, che poi fluttuano
   Gli eroi stanno uno sotto l'altro: tra un segmento e l'altro la camera scende (uno alla volta).
   Pose = funzioni pure di p (+ piccolo moto idle con t e puntatore, spento con reduceMotion). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { seg, smoothstep, easeInOutCubic, easeOutCubic, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture, layerLinesTexture } from './materials.js';
import { FACE, CHANNEL, pieceShapes, pieceAngle } from './logo-shape.js';

/* ---------- tempi ---------- */
const T = {
  cutA: 0.015, cutB: 0.075,
  reA: 0.185, reB: 0.235,
  plateA: 0.19, plateB: 0.245, feedA: 0.212, feedB: 0.25, meltA: 0.236, meltB: 0.262,
  printA: 0.262, printB: 0.322,
  x12A: 0.305, x12B: 0.362,
  rreA: 0.5, rreB: 0.545, dipA: 0.526, dipB: 0.56, rprA: 0.56, rprB: 0.628, liftA: 0.628, liftB: 0.645,
  x23A: 0.636, x23B: 0.692,
  blowA: 0.688, blowB: 0.845, coatA: 0.75, coatB: 0.86, floatA: 0.848, floatB: 0.95
};
/* esplosione hotend: [inizio, fine] per ingresso, dissipatore, heatbreak, ugello, cartuccia, termistore, vite */
const HE_EX = [[0.055, 0.125], [0.062, 0.132], [0.07, 0.14], [0.075, 0.145], [0.085, 0.155], [0.095, 0.165], [0.1, 0.165]];
/* esplosione resina */
const RX = { lid: [0.36, 0.425], car: [0.372, 0.438], vat: [0.385, 0.45], film: [0.395, 0.46], lcd: [0.405, 0.47], uv: [0.415, 0.48], base: [0.425, 0.49] };

/* ---------- attrezzi ---------- */
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const outIn = (p, a0, a1, b0, b1) => easeInOutCubic(seg(p, a0, a1)) * (1 - easeInOutCubic(seg(p, b0, b1)));

function rbox(w, h, d, r, s = 3) {
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
function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}
/* cilindro tornito con spigoli arrotondati (asse Y, centrato) */
function roundCyl(r, h, rr, segs = 32, inner = 0) {
  rr = Math.min(rr, h / 2 - 1e-4, (r - inner) / 2 - 1e-4);
  const pts = [];
  const arc = (cx, cy, a0, a1) => {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (a1 - a0) * (i / 4);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
    }
  };
  if (inner > 0) arc(inner + rr, -h / 2 + rr, Math.PI, Math.PI * 1.5);
  else pts.push(new THREE.Vector2(0, -h / 2));
  arc(r - rr, -h / 2 + rr, -Math.PI / 2, 0);
  arc(r - rr, h / 2 - rr, 0, Math.PI / 2);
  if (inner > 0) arc(inner + rr, h / 2 - rr, Math.PI / 2, Math.PI);
  else pts.push(new THREE.Vector2(0, h / 2));
  if (inner > 0) pts.push(pts[0].clone());
  return new THREE.LatheGeometry(pts, segs);
}
/* poligono chiuso con spigoli raccordati: pts = [[x, y, raggio?], ...] → Vector2[] (ultimo = primo) */
function fillet(pts, rad = 0.004, n = 3) {
  const out = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const [x, y, rr = rad] = pts[i];
    const [ax, ay] = pts[(i - 1 + N) % N], [bx, by] = pts[(i + 1) % N];
    const la = Math.hypot(ax - x, ay - y), lb = Math.hypot(bx - x, by - y);
    const f = Math.min(rr, la * 0.45, lb * 0.45);
    if (f <= 1e-6) { out.push(new THREE.Vector2(x, y)); continue; }
    const p1x = x + (ax - x) / la * f, p1y = y + (ay - y) / la * f;
    const p2x = x + (bx - x) / lb * f, p2y = y + (by - y) / lb * f;
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push(new THREE.Vector2(u * u * p1x + 2 * u * t * x + t * t * p2x, u * u * p1y + 2 * u * t * y + t * t * p2y));
    }
  }
  out.push(out[0].clone());
  return out;
}
/* solido tornito da un profilo (r, y) antiorario, spigoli raccordati */
const lathe = (corners, rad, segs, n = 3) => new THREE.LatheGeometry(fillet(corners, rad, n), segs);
/* uv: u = angolo, v = quota * k (filetti e strati orizzontali veri) oppure raggio * k (anelli di tornitura) */
function uvBy(geo, k, byRadius = false) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / TAU + 0.5;
    uv[i * 2 + 1] = (byRadius ? Math.hypot(p.getX(i), p.getZ(i)) : p.getY(i)) * k;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
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
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function roundRectPath(P, w, h, r, cx = 0, cy = 0) {
  const x = cx - w / 2, y = cy - h / 2;
  P.moveTo(x + r, y);
  P.lineTo(x + w - r, y); P.quadraticCurveTo(x + w, y, x + w, y + r);
  P.lineTo(x + w, y + h - r); P.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  P.lineTo(x + r, y + h); P.quadraticCurveTo(x, y + h, x, y + h - r);
  P.lineTo(x, y + r); P.quadraticCurveTo(x, y, x + r, y);
  return P;
}
/* cornice rettangolare arrotondata (anello) estrusa in verticale: base a y=0, alta h */
function frameGeo(ow, od, iw, id, h, r, ri, bev = 0.003) {
  const s = roundRectPath(new THREE.Shape(), ow - 2 * bev, od - 2 * bev, r);
  s.holes.push(roundRectPath(new THREE.Path(), iw + 2 * bev, id + 2 * bev, ri));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * bev), bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, bev);
  g.rotateX(-Math.PI / 2);
  return g;
}

/* ---------- texture procedurali ---------- */
function noiseTex(size, lo, hi, seed) {
  const R = rng(seed);
  return canvasTex(size, size, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = lo + R() * (hi - lo);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
}
/* filetti solo dove servono: bande [y0, y1] (in frazione dell'altezza) con n righe per unità */
function threadTex(bands, lines) {
  const t = canvasTex(4, 1024, (g, w, h) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    bands.forEach(([a, b]) => {
      const y0 = (1 - b) * h, y1 = (1 - a) * h, step = h / lines;
      for (let y = y0; y < y1; y += step) {
        const grd = g.createLinearGradient(0, y, 0, y + step);
        grd.addColorStop(0, '#303030'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#303030');
        g.fillStyle = grd; g.fillRect(0, y, w, Math.min(step, y1 - y));
      }
    });
  }, false);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
/* righe sottili ripetute (tornitura, strati) */
function stripes(n, a = '#6a6a6a', b = '#ffffff') {
  const t = canvasTex(4, 256, (g, w, h) => {
    const step = h / n;
    for (let i = 0; i < n; i++) {
      const grd = g.createLinearGradient(0, i * step, 0, (i + 1) * step);
      grd.addColorStop(0, a); grd.addColorStop(0.5, b); grd.addColorStop(1, a);
      g.fillStyle = grd; g.fillRect(0, i * step, w, step);
    }
  }, false);
  return t;
}
function brushedTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * h, v = Math.floor(90 + Math.random() * 90);
      g.strokeStyle = `rgba(${v},${v},${v},0.35)`;
      g.lineWidth = Math.random() * 1.2 + 0.2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 2); g.stroke();
    }
  }, false);
}
/* triscele disegnato su canvas (coordinate SVG) */
function drawTriskele(g, cx, cy, scale, face, line) {
  g.save();
  g.translate(cx, cy);
  g.scale(scale, scale);
  for (let k = 0; k < 3; k++) {
    g.save();
    g.rotate(k * (TAU / 3));
    g.beginPath(); FACE.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = face; g.fill();
    g.beginPath(); CHANNEL.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = line; g.fill();
    g.restore();
  }
  g.restore();
}

/* sagoma del pezzo in resina: goccia a sei lobi che ruota salendo (v = 0 attacco al piatto, 1 punta) */
const PART_H = 0.3, RAFT = 0.014;
const partRad = (v) => 0.018 + 0.078 * Math.pow(Math.sin(Math.PI * Math.pow(clamp01(v), 0.8)), 1.1);
const sliceR = (th, v) => partRad(v) * (1 + 0.2 * Math.cos(6 * th + v * 2.6));

/* ======================================================================= */
export async function create(ctx) {
  const small = ctx.small;
  const CS = small ? 36 : 64;               // suddivisioni dei torniti
  ctx.renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  /* luci: key morbida, rim fredda, fill emisferica */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8cbd2, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-2.6, 4.2, 3.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xf3f6ff, 1.4);
  rim.position.set(3.2, 2.6, -3.6);
  scene.add(rim);

  /* ---------- materiali comuni ---------- */
  const brushed = brushedTexture();
  const M = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0x202125, metalness: 0.2, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.75 }),
    shellSoft: new THREE.MeshPhysicalMaterial({ color: 0x2a2b30, metalness: 0.25, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.85 }),
    alu: mat.satinSilver({ roughness: 0.26, roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.15 }),
    aluBright: mat.satinSilver({ color: 0xe2e5ea, roughness: 0.18 }),
    chrome: mat.liquidSilver({ roughness: 0.06 }),
    steel: mat.liquidSilver({ color: 0xd9dce1, roughness: 0.22 }),
    gold: mat.gold(),
    black: mat.matte(0x0b0b0d, { roughness: 0.35, clearcoat: 0.5, envMapIntensity: 0.6 }),
    rubber: mat.matte(0x131315, { roughness: 0.8, envMapIntensity: 0.4 }),
    wire: new THREE.MeshPhysicalMaterial({ color: 0x18181b, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.8 }),
    wireLight: new THREE.MeshPhysicalMaterial({ color: 0xe9eaec, roughness: 0.35, clearcoat: 0.6, envMapIntensity: 0.8 }),
    white: mat.matte(0xecebe8, { roughness: 0.5 }),
    pcb: new THREE.MeshPhysicalMaterial({ color: 0x17221d, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.7 }),
    ledGreen: mat.glow(COLORS.bamboo)
  };
  const shadowTex = radialTexture([[0, 'rgba(18,20,26,0.5)'], [0.45, 'rgba(18,20,26,0.26)'], [0.7, 'rgba(18,20,26,0.07)'], [1, 'rgba(18,20,26,0)']]);
  const shadow = (parent, sx, sz, y = 0.001, o = 1) => {
    const m = add(parent, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: o }), 0, y, 0, -Math.PI / 2);
    m.scale.set(sx, sz, 1);
    m.renderOrder = 1;
    return m;
  };
  const warmTex = radialTexture([[0, 'rgba(255,214,140,0.95)'], [0.3, 'rgba(255,190,100,0.45)'], [1, 'rgba(255,170,80,0)']]);
  const coolTex = radialTexture([[0, 'rgba(206,222,255,0.95)'], [0.35, 'rgba(160,188,255,0.42)'], [1, 'rgba(140,170,255,0)']]);
  const sprite = (tex, s) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    sp.scale.setScalar(s);
    return sp;
  };

  /* inquadratura: punti (angoli dei gruppi nel loro spazio) → coordinate mondo ogni fotogramma */
  const fitOf = (objs, extra = []) => {
    const list = [];
    const box = new THREE.Box3(), inv = new THREE.Matrix4();
    scene.updateMatrixWorld(true);
    objs.forEach((o) => {
      box.setFromObject(o);
      if (box.isEmpty()) return;
      inv.copy(o.matrixWorld).invert();
      for (let i = 0; i < 8; i++) list.push([o, V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv)]);
    });
    extra.forEach((e) => list.push(e));
    return { list, w: list.map(() => V()) };
  };
  const boxPts = (obj, x0, x1, y0, y1, z0, z1) => {
    const out = [];
    for (let i = 0; i < 8; i++) out.push([obj, V(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0)]);
    return out;
  };

  /* =====================================================================
     EROE 1 · HOTEND FDM in sezione (origine di H1 = superficie del piatto)
     ===================================================================== */
  const H1 = group(scene);
  const heRoot = group(H1);                 // posa: posizione + imbardata + inclinazione (perno a metà)
  heRoot.rotation.order = 'ZYX';
  const HE_MID = 0.6;
  const he = group(heRoot, 0, -HE_MID, 0);  // origine = punta dell'ugello, asse = Y

  /* taglio a spicchio (un quarto verso la camera): due piani nello spazio di he, copiati nel mondo */
  const cutLocal = [new THREE.Plane(V(-1, 0, 0), 0), new THREE.Plane(V(1, 0, 0), 0)];
  const cutW = [new THREE.Plane(), new THREE.Plane()];
  const cut = (m) => { m.clippingPlanes = cutW; m.clipIntersection = true; return m; };
  /* "tappo" della sezione: facce posteriori in tinta piatta, viste solo attraverso il taglio */
  const capOf = (hex) => new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide, clippingPlanes: cutW, clipIntersection: true });
  const addCut = (parent, geo, m, cap, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    add(parent, geo, cap, x, y, z, rx, ry, rz);
    return add(parent, geo, m, x, y, z, rx, ry, rz);
  };

  const turned = stripes(90, '#8a8a8a', '#ffffff');
  const hbThread = threadTex([[0, 0.31], [0.6, 1]], 150);
  const nzThread = threadTex([[0.54, 1]], 170);
  const blast = noiseTex(128, 90, 170, 3);
  const MH = {
    fins: cut(mat.satinSilver({ color: 0xd7dade, roughness: 0.22, bumpMap: turned, bumpScale: 0.35 })),
    steel: cut(mat.liquidSilver({ color: 0xd0d3d8, roughness: 0.14, bumpMap: hbThread, bumpScale: 1.4 })),
    block: cut(mat.satinSilver({ color: 0xc4c7cc, roughness: 0.42, roughnessMap: blast, bumpMap: blast, bumpScale: 0.12 })),
    brass: cut(mat.gold({ color: 0xd4a65a, roughness: 0.2, bumpMap: nzThread, bumpScale: 1.2 })),
    brassHex: cut(mat.gold({ color: 0xd4a65a, roughness: 0.18 })),
    ptfe: cut(new THREE.MeshPhysicalMaterial({ color: 0xf3f4f6, roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.85 })),
    collet: cut(mat.gold({ roughness: 0.2 })),
    colletBlack: cut(mat.matte(0x17171a, { roughness: 0.38, clearcoat: 0.6 }))
  };
  const CAP = {
    alu: capOf(0xe2e4e7), steel: capOf(0xc7cacf), block: capOf(0xd6d8db), brass: capOf(0xe7c47e),
    ptfe: capOf(0xffffff), black: capOf(0x2c2c30)
  };

  /* --- quote (unità: 1 mm ≈ 0.02) --- */
  const NZ_TOP = 0.26, BLK_Y0 = 0.14, BLK_Y1 = 0.37, HB_Y = 0.26, HS_Y = 0.495, HS_H = 0.52;
  const IN_Y = 0.64, PTFE_L = 0.64;

  /* ugello: cono + esagono + gambo filettato, foro interno con camera di fusione */
  const nozG = group(he);
  {
    const g = lathe([[0.021, NZ_TOP], [0.021, 0.05], [0.0075, 0.017], [0.0075, 0], [0.022, 0, 0.004], [0.078, 0.055], [0.078, 0.06], [0.06, 0.06], [0.06, NZ_TOP], [0.021, NZ_TOP, 0.002]], 0.003, CS);
    uvBy(g, 1 / NZ_TOP);
    addCut(nozG, g, MH.brass, CAP.brass);
    const hex = new THREE.Shape();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; hex[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 0.094, Math.sin(a) * 0.094); }
    hex.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.03, 0, TAU, true); hex.holes.push(hole);
    const hg = new THREE.ExtrudeGeometry(hex, { depth: 0.068, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 24 });
    hg.rotateX(-Math.PI / 2);
    addCut(nozG, hg, MH.brassHex, CAP.brass, 0, 0.066, 0);
  }

  /* blocco riscaldante + vite di serraggio + fessura */
  const blockG = group(he);
  const BLK = { x0: -0.3, x1: 0.12, d: 0.3 };
  addCut(blockG, rbox(BLK.x1 - BLK.x0, BLK_Y1 - BLK_Y0, BLK.d, 0.02, 4), MH.block, CAP.block, (BLK.x0 + BLK.x1) / 2, (BLK_Y0 + BLK_Y1) / 2, 0);
  add(blockG, new THREE.BoxGeometry(0.11, 0.011, BLK.d + 0.003), M.black, -0.249, 0.29, 0);      // fessura di serraggio
  const CART = { x: -0.19, y: 0.29 }, THERM = { x: -0.087, y: 0.19 };
  // imboccature dei fori (anelli scuri sul frontale)
  add(blockG, new THREE.RingGeometry(0.058, 0.07, 40), M.black, CART.x, CART.y, BLK.d / 2 + 0.0015);
  add(blockG, new THREE.RingGeometry(0.019, 0.027, 32), M.black, THERM.x, THERM.y, BLK.d / 2 + 0.0015);
  const screwG = group(blockG, -0.249, BLK_Y1, 0.06);
  {
    add(screwG, roundCyl(0.032, 0.034, 0.008, 28), M.steel, 0, 0.017, 0);
    add(screwG, new THREE.CylinderGeometry(0.014, 0.014, 0.004, 6), M.black, 0, 0.0345, 0);
    const thr = stripes(18, '#555', '#fff'); thr.repeat.set(1, 1);
    add(screwG, new THREE.CylinderGeometry(0.017, 0.017, 0.1, 18), mat.liquidSilver({ roughness: 0.25, bumpMap: thr, bumpScale: 1 }), 0, -0.05, 0);
  }

  /* cartuccia riscaldante con cavi (esce in avanti nell'esploso) */
  const cartG = group(he, CART.x, CART.y, 0);
  const cartMat = mat.liquidSilver({ color: 0xd6d8dc, roughness: 0.26, emissive: 0xff7a1e, emissiveIntensity: 0 });
  add(cartG, roundCyl(0.058, 0.42, 0.012, 32), cartMat, 0, 0, 0.04, Math.PI / 2);
  add(cartG, roundCyl(0.036, 0.05, 0.01, 24), M.rubber, 0, 0, 0.27, Math.PI / 2);
  const wireCurve = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => V(x, y, z)));
  [-1, 1].forEach((s) => {
    const c = wireCurve([[s * 0.017, 0, 0.29], [s * 0.017, 0.01, 0.36], [s * 0.02 - 0.02, 0.12, 0.42], [s * 0.02 - 0.06, 0.34, 0.38], [s * 0.02 - 0.08, 0.52, 0.3], [s * 0.02 - 0.085, 0.6, 0.27]]);
    add(cartG, new THREE.TubeGeometry(c, 64, 0.013, 10, false), M.wire);
  });
  add(cartG, rbox(0.08, 0.05, 0.04, 0.008), M.white, -0.085, 0.63, 0.27);   // connettore
  add(cartG, rbox(0.06, 0.012, 0.03, 0.003), M.gold, -0.085, 0.661, 0.27);

  /* termistore a cartuccia con cavetti chiari */
  const thermG = group(he, THERM.x, THERM.y, 0);
  add(thermG, roundCyl(0.02, 0.23, 0.006, 24), M.steel, 0, 0, 0.03, Math.PI / 2);
  add(thermG, roundCyl(0.016, 0.03, 0.005, 16), M.rubber, 0, 0, 0.16, Math.PI / 2);
  [-1, 1].forEach((s) => {
    const c = wireCurve([[s * 0.007, 0, 0.17], [s * 0.007, 0.005, 0.24], [s * 0.01 + 0.03, 0.1, 0.33], [s * 0.01 + 0.07, 0.3, 0.33], [s * 0.01 + 0.09, 0.5, 0.26], [s * 0.01 + 0.095, 0.58, 0.24]]);
    add(thermG, new THREE.TubeGeometry(c, 64, 0.0065, 8, false), M.wireLight);
  });
  add(thermG, rbox(0.05, 0.036, 0.03, 0.006), M.white, 0.095, 0.6, 0.24);

  /* heatbreak: filetto basso, collo sottile, filetto alto */
  const hbG = group(he, 0, HB_Y, 0);
  {
    const L = 0.38;
    const g = lathe([[0.022, 0], [0.058, 0], [0.058, 0.118], [0.03, 0.146], [0.03, 0.2], [0.066, 0.228], [0.066, L], [0.022, L]], 0.0035, CS);
    uvBy(g, 1 / L);
    addCut(hbG, g, MH.steel, CAP.steel);
  }

  /* dissipatore alettato (tornito) con attacco groove-mount */
  const hsG = group(he, 0, HS_Y, 0);
  {
    const c = [[0.066, 0]];
    for (let k = 0; k < 8; k++) {
      const y0 = k * 0.042, y1 = y0 + 0.02;
      c.push([0.22, y0, 0.007], [0.22, y1, 0.007], [0.085, y1, 0.004]);
      if (k < 7) c.push([0.085, y0 + 0.042, 0.004]);
    }
    c.push([0.085, 0.36, 0.004], [0.16, 0.36], [0.16, 0.4], [0.12, 0.4, 0.004], [0.12, 0.47, 0.004], [0.16, 0.47], [0.16, HS_H], [0.042, HS_H, 0.003], [0.042, 0.21, 0.002], [0.066, 0.21, 0.002]);
    const g = lathe(c, 0.005, CS);
    uvBy(g, 1, true);
    turned.repeat.set(1, 3);
    addCut(hsG, g, MH.fins, CAP.alu);
  }

  /* ingresso: tubo PTFE + innesto rapido (oro) */
  const inG = group(he, 0, IN_Y, 0);
  {
    addCut(inG, lathe([[0.021, 0], [0.04, 0], [0.04, PTFE_L], [0.021, PTFE_L]], 0.004, CS), MH.ptfe, CAP.ptfe);
    const top = HS_Y + HS_H - IN_Y;
    addCut(inG, lathe([[0.041, 0], [0.074, 0], [0.074, 0.046], [0.041, 0.046]], 0.006, CS), MH.collet, CAP.brass, 0, top, 0);
    addCut(inG, lathe([[0.041, 0], [0.06, 0], [0.06, 0.024], [0.041, 0.024]], 0.006, CS), MH.colletBlack, CAP.black, 0, top + 0.046, 0);
  }
  const heGroups = [inG, hsG, hbG, nozG, cartG, thermG, screwG];
  const heBase = heGroups.map((g) => g.position.clone());
  const fitHe = fitOf(heGroups);

  /* filamento verde bambù (non tagliato) + parte fusa (oro) */
  const FIL_TOP = IN_Y + PTFE_L + 0.1, MELT_TOP = BLK_Y1 + 0.02;
  const filMat = mat.bambooGreen({ roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const fil = add(he, new THREE.CylinderGeometry(0.0175, 0.0175, 1, 18).translate(0, -0.5, 0), filMat, 0, FIL_TOP, 0);
  const meltGeo = lathe([[0, -0.012], [0.0068, -0.012], [0.0068, 0.017], [0.0195, 0.05], [0.0195, MELT_TOP], [0, MELT_TOP]], 0.002, 24);
  {
    const p = meltGeo.attributes.position, col = new Float32Array(p.count * 3);
    const cHot = new THREE.Color(0xffd27a), cMid = new THREE.Color(0xf6a543), cCool = new THREE.Color(COLORS.bamboo), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const k = clamp01((p.getY(i) - 0.02) / (MELT_TOP - 0.02));
      if (k < 0.55) c.copy(cHot).lerp(cMid, k / 0.55); else c.copy(cMid).lerp(cCool, (k - 0.55) / 0.45);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    meltGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const meltClip = new THREE.Plane(V(0, 1, 0), 0);
  const melt = add(he, meltGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, clippingPlanes: [meltClip] }));
  const meltGlow = sprite(warmTex, 0.55); meltGlow.position.set(0, 0.24, 0.02); he.add(meltGlow);
  const tipGlow = sprite(warmTex, 0.16); tipGlow.position.set(0, 0.0, 0); he.add(tipGlow);
  const nozHeat = MH.brass;                  // l'ugello si scalda (leggero emissivo)
  nozHeat.emissive = new THREE.Color(0xff8a2a);
  MH.brassHex.emissive = new THREE.Color(0xff8a2a);

  /* piatto (PEI scuro con bordo oro) che arriva per la stampa */
  const plG = group(H1);
  const plateGold = mat.gold({ transparent: true });
  const pei = noiseTex(256, 40, 220, 5); pei.repeat.set(4, 4);
  const plateTop = new THREE.MeshPhysicalMaterial({ color: 0x2a2b2f, roughness: 0.6, roughnessMap: pei, bumpMap: pei, bumpScale: 0.3, metalness: 0.1, envMapIntensity: 0.8, transparent: true });
  const PL_W = 1.34, PL_D = 1.0;
  add(plG, rbox(PL_W, 0.014, PL_D, 0.007, 2), plateGold, 0, -0.011, 0);
  add(plG, new THREE.BoxGeometry(PL_W - 0.02, 0.004, PL_D - 0.02), plateTop, 0, -0.002, 0);
  add(plG, rbox(0.1, 0.014, 0.04, 0.006, 2), plateGold, 0, -0.011, PL_D / 2 + 0.012);
  const plShadow = shadow(plG, PL_W * 1.5, PL_D * 1.6, -0.02, 0.7);
  plShadow.material.opacity = 0;

  /* cordolo: contorno dei tre pezzi del logo, con fronte caldo che segue l'ugello */
  const BEAD_W = 0.04, BEAD_H = 0.024, LOGO_S = 0.44;
  const path = { x: [], z: [], d: [], ext: [] };
  const beadParts = [];
  {
    let D = 0, px = null, pz = null;
    const push = (x, z, ext) => {
      if (px !== null) D += Math.hypot(x - px, z - pz);
      path.x.push(x); path.z.push(z); path.d.push(D); path.ext.push(ext);
      px = x; pz = z;
    };
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3, c = Math.cos(a), s = Math.sin(a);
      const f = fillet(FACE.map(([x, y]) => [(x * c - y * s) * LOGO_S, (x * s + y * c) * LOGO_S]), 0.02, 4);
      // ricampiona a passo costante
      const pts = [];
      let acc = 0;
      pts.push(f[0].clone());
      for (let i = 1; i < f.length; i++) {
        const l = f[i].distanceTo(f[i - 1]);
        acc += l;
        if (acc >= 0.008 || i === f.length - 1) { pts.push(f[i].clone()); acc = 0; }
      }
      // spostamento a vuoto fino all'inizio del contorno
      if (px !== null) {
        const n = 8;
        for (let i = 1; i < n; i++) push(lerp(px, pts[0].x, i / n), lerp(pz, pts[0].y, i / n), 0);
      }
      const d0 = [];
      pts.forEach((q) => { push(q.x, q.y, 1); d0.push(D); });
      beadParts.push({ pts, d: d0 });
    }
    path.total = D;
  }
  const beadGeo = (() => {
    const pos = [], nor = [], dist = [], idx = [];
    const RAD = 12;
    let base = 0;
    beadParts.forEach(({ pts, d }) => {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, tz = b.y - a.y;
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const sx = -tz, sz = tx;
        for (let j = 0; j <= RAD; j++) {
          const an = (j / RAD) * TAU, ca = Math.cos(an), sa = Math.sin(an);
          const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.7), ey = Math.sign(sa) * Math.pow(Math.abs(sa), 0.8);
          pos.push(pts[i].x + sx * ex * BEAD_W / 2, BEAD_H / 2 + ey * BEAD_H / 2, pts[i].y + sz * ex * BEAD_W / 2);
          const nx = sx * ca, ny = sa * 0.9, nz = sz * ca, nl = Math.hypot(nx, ny, nz) || 1;
          nor.push(nx / nl, ny / nl, nz / nl);
          dist.push(d[i]);
        }
      }
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < RAD; j++) {
          const q = base + i * (RAD + 1) + j, r = q + RAD + 1;
          idx.push(q, r, q + 1, r, r + 1, q + 1);
        }
      }
      base += n * (RAD + 1);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setIndex(idx);
    return g;
  })();
  const beadU = { uHead: { value: 0 }, uHot: { value: new THREE.Color(0xffc25e) } };
  const beadMat = mat.bambooGreen({ roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
  beadMat.onBeforeCompile = (sh) => {
    sh.uniforms.uHead = beadU.uHead; sh.uniforms.uHot = beadU.uHot;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDist;\nvarying float vDist;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDist = aDist;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHead;\nuniform vec3 uHot;\nvarying float vDist;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vDist > uHead) discard;\nfloat heat = 1.0 - smoothstep(0.0, 0.2, uHead - vDist);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uHot, heat * 0.85);\ntotalEmissiveRadiance += uHot * heat * heat * 1.4;');
  };
  beadMat.customProgramCacheKey = () => 'tv-bead';
  const bead = add(plG, beadGeo, beadMat);
  bead.frustumCulled = false;
  const heShadow = shadow(H1, 0.9, 0.9, 0.0, 0);

  /* inquadrature dell'eroe 1: A = hotend (qualsiasi posa), B = piatto + hotend in stampa */
  const fit1B = fitOf([], boxPts(H1, -0.62, 0.62, -0.02, 1.34, -0.5, 0.5));

  /* =====================================================================
     EROE 2 · STAMPANTE A RESINA (MSLA)  (origine = sotto la base)
     ===================================================================== */
  const H2Y = -3.0;
  const H2 = group(scene, 0, H2Y, 0);
  const pr = group(H2);
  const P2 = { W: 0.9, D: 0.7, DECK: 0.172, FILM: 0.177, CAR: 0.34, VZ: 0.05 };

  // base (scocca inferiore)
  const baseG = group(pr);
  add(baseG, rbox(P2.W, 0.15, P2.D, 0.032, 4), M.shell, 0, 0.075, 0);
  add(baseG, rbox(P2.W + 0.004, 0.006, P2.D + 0.004, 0.003, 2), M.aluBright, 0, 0.148, 0);
  {
    const fg = roundCyl(0.04, 0.03, 0.008, 24);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add(baseG, fg, M.rubber, a * 0.36, -0.01, b * 0.26));
    const slot = rbox(0.004, 0.06, 0.028, 0.0019, 2);
    const n = 10, inst = new THREE.InstancedMesh(slot, M.black, n * 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const z = -0.2 + (i / (n - 1)) * 0.4;
      m4.makeTranslation(P2.W / 2 + 0.0005, 0.075, z); inst.setMatrixAt(i, m4);
      m4.makeTranslation(-P2.W / 2 - 0.0005, 0.075, z); inst.setMatrixAt(n + i, m4);
    }
    baseG.add(inst);
  }
  // schermino frontale con interfaccia
  const uiCv = document.createElement('canvas'); uiCv.width = 256; uiCv.height = 112;
  const ug = uiCv.getContext('2d');
  const uiTex = new THREE.CanvasTexture(uiCv); uiTex.colorSpace = THREE.SRGBColorSpace; uiTex.anisotropy = 8;
  let uiKey = -1;
  const drawUI = (prog) => {
    const k = Math.round(prog * 50);
    if (k === uiKey) return;
    uiKey = k;
    ug.fillStyle = '#050506'; ug.fillRect(0, 0, 256, 112);
    drawTriskele(ug, 40, 46, 20, '#eceef1', '#050506');
    ug.fillStyle = '#26272b'; ug.beginPath(); ug.roundRect(80, 38, 152, 10, 5); ug.fill();
    const gr = ug.createLinearGradient(80, 0, 232, 0); gr.addColorStop(0, '#a87d3a'); gr.addColorStop(1, '#ecd08f');
    ug.fillStyle = gr; ug.beginPath(); ug.roundRect(80, 38, Math.max(10, 152 * prog), 10, 5); ug.fill();
    ug.fillStyle = prog >= 1 ? '#9fb46a' : '#d9b36a'; ug.beginPath(); ug.arc(222, 78, 6, 0, TAU); ug.fill();
    ug.fillStyle = '#3a3b40'; for (let i = 0; i < 3; i++) { ug.beginPath(); ug.roundRect(80 + i * 40, 70, 30, 16, 4); ug.fill(); }
    uiTex.needsUpdate = true;
  };
  drawUI(0);
  {
    const scr = group(baseG, -0.24, 0.078, P2.D / 2 + 0.002);
    add(scr, rbox(0.2, 0.09, 0.008, 0.008, 2), M.black);
    add(scr, new THREE.PlaneGeometry(0.184, 0.08), new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: uiTex, emissiveIntensity: 1.0, roughness: 0.08, clearcoat: 1, envMapIntensity: 0.5 }), 0, 0, 0.0042);
    add(baseG, rbox(0.035, 0.006, 0.004, 0.002, 2), M.ledGreen, 0.36, 0.078, P2.D / 2 + 0.001);
  }

  // matrice UV: piastra, alette, LED con riflettori
  const uvG = group(pr);
  const uvGlowMat = mat.glow(0xe6eeff);
  {
    add(uvG, rbox(0.5, 0.012, 0.36, 0.004, 2), M.pcb, 0, 0.104, P2.VZ);
    add(uvG, rbox(0.5, 0.014, 0.36, 0.004, 2), M.alu, 0, 0.09, P2.VZ);
    const fin = rbox(0.006, 0.052, 0.34, 0.0025, 2);
    const nF = 18, fins = new THREE.InstancedMesh(fin, M.aluBright, nF);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nF; i++) { m4.makeTranslation(-0.235 + i * (0.47 / (nF - 1)), 0.057, P2.VZ); fins.setMatrixAt(i, m4); }
    uvG.add(fins);
    const nx = 8, nz = 6, n = nx * nz;
    const dome = new THREE.SphereGeometry(0.016, 14, 7, 0, TAU, 0, Math.PI / 2);
    const cup = new THREE.TorusGeometry(0.022, 0.0045, 6, 20).rotateX(Math.PI / 2);
    const led = new THREE.InstancedMesh(dome, uvGlowMat, n), cups = new THREE.InstancedMesh(cup, M.aluBright, n);
    for (let i = 0; i < n; i++) {
      const x = -0.2 + (i % nx) * (0.4 / (nx - 1)), z = P2.VZ - 0.135 + Math.floor(i / nx) * (0.27 / (nz - 1));
      m4.makeTranslation(x, 0.11, z); led.setMatrixAt(i, m4);
      m4.makeTranslation(x, 0.112, z); cups.setMatrixAt(i, m4);
    }
    uvG.add(led, cups);
    add(uvG, rbox(0.1, 0.012, 0.03, 0.004, 2), M.white, 0.19, 0.116, P2.VZ + 0.165);   // connettore
  }

  // piano superiore (alluminio) con finestra per l'LCD + torre dell'asse Z
  const deckG = group(pr);
  {
    const s = roundRectPath(new THREE.Shape(), P2.W - 0.006, P2.D - 0.006, 0.03);
    s.holes.push(roundRectPath(new THREE.Path(), 0.546, 0.366, 0.012, 0, -P2.VZ));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    add(deckG, g, M.alu, 0, 0.153, 0);
    // torre Z
    const TZ = -0.275;
    add(deckG, rbox(0.13, 0.71, 0.1, 0.02, 4), M.shell, 0, 0.17 + 0.355, TZ);
    add(deckG, rbox(0.03, 0.64, 0.006, 0.003, 2), M.black, 0, 0.53, TZ + 0.051);
    const thr = stripes(160, '#444', '#fff'); thr.repeat.set(1, 1);
    add(deckG, new THREE.CylinderGeometry(0.009, 0.009, 0.66, 18), mat.liquidSilver({ roughness: 0.18, bumpMap: thr, bumpScale: 1.2 }), 0, 0.53, TZ + 0.062);
    [-0.045, 0.045].forEach((x) => add(deckG, new THREE.CylinderGeometry(0.0065, 0.0065, 0.66, 16), M.chrome, x, 0.53, TZ + 0.058));
    add(deckG, rbox(0.14, 0.03, 0.11, 0.01, 3), M.aluBright, 0, 0.885, TZ);
  }

  // LCD di mascheratura: vetro nero con la fetta accesa + cavo piatto
  const lcdG = group(pr);
  const LCD_W = 0.5, LCD_D = 0.328;
  const lcdCv = document.createElement('canvas'); lcdCv.width = 512; lcdCv.height = 336;
  const lg = lcdCv.getContext('2d');
  const lcdTex = new THREE.CanvasTexture(lcdCv); lcdTex.colorSpace = THREE.SRGBColorSpace; lcdTex.anisotropy = 8;
  let lcdKey = -1;
  const drawLCD = (v) => {
    const k = Math.round(v * 120);
    if (k === lcdKey) return;
    lcdKey = k;
    lg.fillStyle = '#020203'; lg.fillRect(0, 0, 512, 336);
    lg.strokeStyle = 'rgba(255,255,255,0.035)'; lg.lineWidth = 1;
    for (let x = 0; x < 512; x += 8) { lg.beginPath(); lg.moveTo(x + 0.5, 0); lg.lineTo(x + 0.5, 336); lg.stroke(); }
    for (let y = 0; y < 336; y += 8) { lg.beginPath(); lg.moveTo(0, y + 0.5); lg.lineTo(512, y + 0.5); lg.stroke(); }
    const s = 512 / LCD_W, cx = 256, cy = 168;
    lg.beginPath();
    for (let i = 0; i <= 144; i++) { const th = (i / 144) * TAU, r = sliceR(th, v) * s; lg.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r); }
    lg.closePath();
    lg.shadowColor = 'rgba(150,185,255,0.95)'; lg.shadowBlur = 18;
    lg.fillStyle = '#f2f6ff'; lg.fill();
    lg.shadowBlur = 0;
    lcdTex.needsUpdate = true;
  };
  drawLCD(0.42);
  const lcdMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 1.1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.9 });
  {
    add(lcdG, rbox(0.534, 0.008, 0.354, 0.003, 2), M.black, 0, 0.162, P2.VZ);
    add(lcdG, new THREE.PlaneGeometry(LCD_W, LCD_D), lcdMat, 0, 0.1664, P2.VZ, -Math.PI / 2);
    add(lcdG, rbox(0.13, 0.05, 0.003, 0.0014, 2), mat.gold({ color: 0xc98f3d, roughness: 0.35 }), 0.12, 0.137, P2.VZ - 0.178);
  }

  // pellicola (FEP) con cornice di serraggio: iridescente
  const filmG = group(pr);
  const filmMat = mat.glass({ color: 0xffffff, opacity: 0.3, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [220, 520], envMapIntensity: 1.8 });
  {
    add(filmG, frameGeo(0.62, 0.44, 0.54, 0.36, 0.008, 0.03, 0.014), M.aluBright, 0, 0.169, P2.VZ);
    const f = add(filmG, new THREE.PlaneGeometry(0.556, 0.376), filmMat, 0, 0.1768, P2.VZ, -Math.PI / 2);
    f.renderOrder = 3;
  }

  // vasca: pareti in alluminio, resina trasparente, pomelli oro
  const vatG = group(pr);
  const resinMat = new THREE.MeshPhysicalMaterial({ color: 0xbfd6e2, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.3, envMapIntensity: 1.6, clearcoat: 1, depthWrite: false });
  {
    add(vatG, frameGeo(0.62, 0.44, 0.54, 0.36, 0.1, 0.03, 0.014, 0.004), M.aluBright, 0, P2.FILM, P2.VZ);
    const r = add(vatG, rbox(0.536, 0.052, 0.356, 0.006, 2), resinMat, 0, P2.FILM + 0.027, P2.VZ);
    r.renderOrder = 4;
    [-1, 1].forEach((s) => {
      add(vatG, rbox(0.07, 0.014, 0.12, 0.006, 2), M.aluBright, s * 0.335, P2.FILM + 0.02, P2.VZ);
      add(vatG, roundCyl(0.024, 0.036, 0.008, 28), M.gold, s * 0.345, P2.FILM + 0.045, P2.VZ);
    });
    add(vatG, rbox(0.06, 0.02, 0.05, 0.008, 2), M.aluBright, 0.28, P2.FILM + 0.092, P2.VZ + 0.21, 0, Math.PI / 4, 0);   // beccuccio
  }

  // carrello Z con braccio e piatto di stampa (origine = superficie di stampa, sotto)
  const zCar = group(pr, 0, P2.CAR, P2.VZ);
  const etch = noiseTex(128, 120, 200, 9); etch.repeat.set(3, 3);
  {
    add(zCar, rbox(0.34, 0.034, 0.26, 0.01, 3), M.alu, 0, 0.017, 0);
    add(zCar, new THREE.BoxGeometry(0.326, 0.002, 0.246), mat.satinSilver({ color: 0xb8bcc2, roughness: 0.5, roughnessMap: etch, bumpMap: etch, bumpScale: 0.3 }), 0, -0.0005, 0);
    add(zCar, rbox(0.11, 0.05, 0.11, 0.012, 3), M.shellSoft, 0, 0.058, 0);
    add(zCar, roundCyl(0.03, 0.03, 0.008, 28), M.gold, 0, 0.098, 0);
    add(zCar, rbox(0.08, 0.042, 0.28, 0.012, 3), M.shell, 0, 0.066, -0.155);
    add(zCar, rbox(0.16, 0.12, 0.05, 0.014, 3), M.shellSoft, 0, 0.066, -0.3);
  }
  // pezzo in resina, appeso a testa in giù: cresce dal pelo della pellicola (piano di taglio)
  const filmClip = new THREE.Plane(V(0, 1, 0), 0);
  const partLayers = stripes(60, '#9a9a9a', '#ffffff');
  const partGeo = (() => {
    const NV = small ? 60 : 96, NU = small ? 48 : 72;
    const pos = [], uv = [], idx = [];
    pos.push(0, 0, 0); uv.push(0.5, 0);             // centro della zattera
    // zattera
    for (let j = 0; j <= NU; j++) { const a = j / NU * TAU; pos.push(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1); uv.push(j / NU, 0); }
    for (let j = 0; j <= NU; j++) { const a = j / NU * TAU; pos.push(Math.cos(a) * 0.1, -RAFT, Math.sin(a) * 0.1); uv.push(j / NU, RAFT * 20); }
    const ring0 = 1, ring1 = 2 + NU;
    for (let j = 0; j < NU; j++) {
      idx.push(0, ring0 + j + 1, ring0 + j);
      idx.push(ring0 + j, ring0 + j + 1, ring1 + j);
      idx.push(ring0 + j + 1, ring1 + j + 1, ring1 + j);
    }
    const start = pos.length / 3;
    for (let i = 0; i <= NV; i++) {
      const v = i / NV, y = -RAFT - v * PART_H;
      for (let j = 0; j <= NU; j++) {
        const th = j / NU * TAU, r = sliceR(th, v);
        pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
        uv.push(j / NU, (RAFT + v * PART_H) * 20);
      }
    }
    // chiusura della zattera sotto (anello → primo anello del corpo)
    for (let j = 0; j < NU; j++) {
      const a = ring1 + j, b = ring1 + j + 1, c = start + j, d = start + j + 1;
      idx.push(a, b, c, b, d, c);
    }
    for (let i = 0; i < NV; i++) {
      for (let j = 0; j < NU; j++) {
        const a = start + i * (NU + 1) + j, b = a + NU + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const tip = pos.length / 3;
    pos.push(0, -RAFT - PART_H - 0.006, 0); uv.push(0.5, 20);
    const last = start + NV * (NU + 1);
    for (let j = 0; j < NU; j++) idx.push(last + j, last + j + 1, tip);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  partLayers.repeat.set(1, 1);
  const partBack = new THREE.MeshPhysicalMaterial({ color: 0x9db4c3, roughness: 0.08, transparent: true, opacity: 0.32, side: THREE.BackSide, depthWrite: false, envMapIntensity: 1.4, clippingPlanes: [filmClip] });
  const partFront = new THREE.MeshPhysicalMaterial({ color: 0xe3eef5, roughness: 0.04, transparent: true, opacity: 0.4, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.4, specularIntensity: 1, depthWrite: false, bumpMap: partLayers, bumpScale: 0.25, clippingPlanes: [filmClip] });
  const partG = group(zCar, 0, -0.001, 0);
  add(partG, partGeo, partBack).renderOrder = 5;
  add(partG, partGeo, partFront).renderOrder = 6;
  // bagliore UV sotto il pezzo durante l'esposizione
  const expoMat = new THREE.MeshBasicMaterial({ map: coolTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const expo = add(pr, new THREE.PlaneGeometry(0.42, 0.42), expoMat, 0, P2.FILM + 0.004, P2.VZ, -Math.PI / 2);
  expo.renderOrder = 2;

  // coperchio ambra (cappa)
  const lidG = group(pr);
  const lidMat = mat.glass({ color: 0xe8a23a, opacity: 0.44, roughness: 0.04, envMapIntensity: 1.7 });
  const lidEdge = mat.matte(0x2a2210, { roughness: 0.4, transparent: true });
  {
    const l = add(lidG, rbox(0.86, 0.74, 0.66, 0.04, 4), lidMat, 0, 0.172 + 0.37, -0.01);
    l.renderOrder = 7;
    add(lidG, frameGeo(0.866, 0.666, 0.826, 0.626, 0.016, 0.042, 0.03), lidEdge, 0, 0.17, -0.01);
  }
  const prGroups = [baseG, uvG, deckG, lcdG, filmG, vatG, zCar, lidG];
  const fit2A = fitOf(prGroups);
  const fit2B = fitOf([], boxPts(pr, -0.46, 0.46, -0.02, 0.92, -0.36, 0.36));
  const uvGlow = sprite(coolTex, 0.9); uvGlow.position.set(0, 0.14, P2.VZ); uvG.add(uvGlow);
  const prShadow = shadow(H2, 1.6, 1.25, -0.035, 0.85);

  /* =====================================================================
     EROE 3 · NYLON 12 (HP Multi Jet Fusion): blocco di polvere → pezzi
     ===================================================================== */
  const H3Y = -6.0;
  const H3 = group(scene, 0, H3Y, 0);
  const mj = group(H3);
  const CAKE = { w: 1.1, h: 0.62, d: 0.8 };

  // piattaforma
  const platG = group(mj);
  add(platG, rbox(1.36, 0.06, 1.02, 0.022, 4), M.shell, 0, -0.03, 0);
  add(platG, rbox(1.364, 0.006, 1.024, 0.003, 2), M.aluBright, 0, -0.002, 0);

  // materiale nylon: grigio opaco sinterizzato (all'inizio velato di polvere)
  const sinter = noiseTex(256, 70, 190, 21); sinter.repeat.set(3, 3);
  const nylon = new THREE.MeshPhysicalMaterial({ color: 0x5d6065, roughness: 0.82, roughnessMap: sinter, bumpMap: sinter, bumpScale: 0.5, metalness: 0, envMapIntensity: 0.7, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xb0b3b8) });
  const nylonDark = mat.matte(0x2e3033, { roughness: 0.9 });
  const NY_GREY = new THREE.Color(0x5d6065), NY_POWDER = new THREE.Color(0xdedcd6);

  // sfera a reticolo (guscio geodetico + guscio interno + raggi)
  const latticeGeo = (() => {
    const R = 0.2, r = 0.012;
    const parts = [];
    const strut = new THREE.CylinderGeometry(r, r, 1, 7, 1, true);
    const node = new THREE.IcosahedronGeometry(r * 1.45, 1);
    const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), up = V(0, 1, 0), dir = V(), mid = V(), sc = V();
    const verts = (radius, detail) => {
      const g = mergeVertices(new THREE.IcosahedronGeometry(radius, detail).deleteAttribute('normal').deleteAttribute('uv'), 1e-4);
      const p = g.attributes.position, vs = [];
      for (let i = 0; i < p.count; i++) vs.push(V(p.getX(i), p.getY(i), p.getZ(i)));
      const edges = new Set(), ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        [[ix[i], ix[i + 1]], [ix[i + 1], ix[i + 2]], [ix[i + 2], ix[i]]].forEach(([a, b]) => edges.add(a < b ? a + '_' + b : b + '_' + a));
      }
      return { vs, edges: [...edges].map((e) => e.split('_').map(Number)) };
    };
    const link = (a, b, rr = 1) => {
      dir.subVectors(b, a); const len = dir.length(); dir.normalize();
      q.setFromUnitVectors(up, dir); mid.addVectors(a, b).multiplyScalar(0.5);
      m4.compose(mid, q, sc.set(rr, len, rr));
      parts.push(strut.clone().applyMatrix4(m4));
    };
    const outer = verts(R, 1), inner = verts(R * 0.52, 0);
    const rot = new THREE.Matrix4().makeRotationY(0.5);
    inner.vs.forEach((v) => v.applyMatrix4(rot));
    outer.edges.forEach(([a, b]) => link(outer.vs[a], outer.vs[b]));
    inner.edges.forEach(([a, b]) => link(inner.vs[a], inner.vs[b], 0.9));
    inner.vs.forEach((v) => {
      let best = outer.vs[0], bd = 1e9;
      outer.vs.forEach((o) => { const d = o.distanceToSquared(v); if (d < bd) { bd = d; best = o; } });
      link(v, best, 0.85);
    });
    [...outer.vs, ...inner.vs].forEach((v) => parts.push(node.clone().translate(v.x, v.y, v.z)));
    const nodesOnly = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    nodesOnly.forEach((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); });
    return mergeGeometries(nodesOnly);
  })();

  // ingranaggio con fori di alleggerimento e mozzo
  const gearGeo = (() => {
    const N = 15, rO = 0.2, rR = 0.168, st = TAU / N, pts = [];
    for (let i = 0; i < N; i++) {
      const a = i * st;
      [[rR, a - 0.5 * st, 0.006], [rR, a - 0.27 * st, 0.008], [rO, a - 0.13 * st, 0.007], [rO, a + 0.13 * st, 0.007], [rR, a + 0.27 * st, 0.008]]
        .forEach(([r, an, f]) => pts.push([Math.cos(an) * r, Math.sin(an) * r, f]));
    }
    const s = new THREE.Shape(fillet(pts, 0.006, 3));
    const hub = new THREE.Path(); hub.absarc(0, 0, 0.045, 0, TAU, true); s.holes.push(hub);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3, h = new THREE.Path();
      h.absarc(Math.cos(a) * 0.112, Math.sin(a) * 0.112, 0.034, 0, TAU, true); s.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 20 });
    g.translate(0, 0, -0.025);
    const boss = roundCyl(0.072, 0.1, 0.01, 40, 0.045).rotateX(Math.PI / 2);
    [g, boss].forEach((x) => { if (x.index) return; });
    const a = g.toNonIndexed(), b = boss.toNonIndexed();
    return mergeGeometries([a, b].map((x) => { x.deleteAttribute('uv'); return x; }));
  })();

  // staffa a L con nervatura
  const bracketGeo = (() => {
    const L = fillet([[0, 0, 0.012], [0.36, 0, 0.012], [0.36, 0.045, 0.012], [0.045, 0.045, 0.055], [0.045, 0.26, 0.012], [0, 0.26, 0.012]], 0.012, 5);
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(L), { depth: 0.15, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2 });
    const r = fillet([[0.04, 0.04, 0.004], [0.26, 0.04, 0.03], [0.04, 0.21, 0.03]], 0.01, 4);
    const rib = new THREE.ExtrudeGeometry(new THREE.Shape(r), { depth: 0.026, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
    rib.translate(0, 0, 0.062);
    const out = mergeGeometries([g.toNonIndexed(), rib.toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }));
    out.translate(-0.16, -0.12, -0.075);
    return out;
  })();

  // logo Tillverka in nylon (faccia + canale in rilievo)
  const logoGeo = (() => {
    const { face, channel } = pieceShapes(THREE);
    const list = [];
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Matrix4().makeRotationZ(pieceAngle(k));
      const f = new THREE.ExtrudeGeometry(face, { depth: 0.22, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
      const c = new THREE.ExtrudeGeometry(channel, { depth: 0.14, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
      f.applyMatrix4(r); c.applyMatrix4(r);
      list.push(f.toNonIndexed(), c.toNonIndexed());
    }
    const g = mergeGeometries(list.map((x) => { x.deleteAttribute('uv'); return x; }));
    g.translate(0, 0, -0.11);
    g.scale(0.225, 0.225, 0.225);
    return g;
  })();

  /* pezzi: posa nel blocco (stipati) e posa finale (fluttuano) */
  const pieces = [
    { geo: latticeGeo, a: [-0.29, 0.3, -0.13, 0.3, 0.2, 0], b: [-0.34, 0.9, -0.02, 0.2, 0, 0.1] },
    { geo: gearGeo, a: [0.27, 0.15, 0.13, -Math.PI / 2 + 0.16, 0, 0.3], b: [0.36, 0.9, -0.04, 0.12, -0.35, 0] },
    { geo: bracketGeo, a: [0.25, 0.43, -0.17, 0.08, 0.5, 0.05], b: [-0.34, 0.36, 0.06, 0.1, 0.55, 0] },
    { geo: logoGeo, a: [-0.12, 0.38, 0.24, -0.22, 0.25, 0.1], b: [0.36, 0.38, 0.06, 0.05, -0.3, 0] }
  ].map((d, i) => {
    const g = group(mj);
    const m = add(g, d.geo, nylon);
    return { ...d, g, m, i };
  });
  const fit3A = fitOf([], boxPts(mj, -0.68, 0.68, -0.07, CAKE.h + 0.02, -0.52, 0.52));
  const fit3B = fitOf([], boxPts(mj, -0.68, 0.68, -0.07, 1.14, -0.52, 0.52));
  const pieceShadows = pieces.map(() => shadow(mj, 0.5, 0.5, 0.002, 0));

  // blocco di polvere: nucleo solido che si dissolve + granelli (Points) soffiati via dal vento
  const powderU = { uFront: { value: -1 } };
  const NOISE_GLSL = `
    float tvHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float tvNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(tvHash(i), tvHash(i + vec3(1,0,0)), f.x), mix(tvHash(i + vec3(0,1,0)), tvHash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(tvHash(i + vec3(0,0,1)), tvHash(i + vec3(1,0,1)), f.x), mix(tvHash(i + vec3(0,1,1)), tvHash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }`;
  const frontCoord = (x, y) => 0.85 * ((x + CAKE.w / 2) / CAKE.w) + 0.12 * (y / CAKE.h);
  const powderTex = noiseTex(256, 150, 255, 33); powderTex.repeat.set(4, 4);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.96, bumpMap: powderTex, bumpScale: 0.6, envMapIntensity: 0.55, side: THREE.DoubleSide });
  coreMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFront = powderU.uFront;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uFront;\nvarying vec3 vObj;\n${NOISE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float fc = 0.85 * ((vObj.x + ${(CAKE.w / 2).toFixed(3)}) / ${CAKE.w.toFixed(3)}) + 0.12 * (vObj.y / ${CAKE.h.toFixed(3)});
        float nz = tvNoise(vObj * 9.0) * 0.6 + tvNoise(vObj * 23.0) * 0.4;
        float edge = fc + (nz - 0.5) * 0.22 - uFront;
        if (edge < 0.0) discard;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ndiffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.035, edge));');
  };
  coreMat.customProgramCacheKey = () => 'tv-core';
  const core = add(mj, rbox(CAKE.w - 0.012, CAKE.h - 0.012, CAKE.d - 0.012, 0.03, 3), coreMat, 0, CAKE.h / 2, 0);

  const NP = small ? 7000 : 15000;
  const grains = (() => {
    const R = rng(77);
    const pos = new Float32Array(NP * 3), rel = new Float32Array(NP), rnd = new Float32Array(NP * 4);
    const areas = [CAKE.w * CAKE.d, CAKE.w * CAKE.h, CAKE.w * CAKE.h, CAKE.d * CAKE.h, CAKE.d * CAKE.h];
    const tot = areas.reduce((a, b) => a + b, 0);
    const inPiece = (x, y, z) => pieces.some((pc) => Math.hypot(x - pc.a[0], y - pc.a[1], z - pc.a[2]) < 0.2);
    for (let i = 0; i < NP; i++) {
      let x, y, z;
      if (i < NP * 0.7) {
        let f = R() * tot, k = 0;
        while (f > areas[k] && k < 4) { f -= areas[k]; k++; }
        const u = R() - 0.5, v = R(), inset = R() * 0.012;
        if (k === 0) { x = u * CAKE.w; z = (v - 0.5) * CAKE.d; y = CAKE.h - inset; }
        else if (k < 3) { x = u * CAKE.w; y = v * CAKE.h; z = (k === 1 ? 1 : -1) * (CAKE.d / 2 - inset); }
        else { z = u * CAKE.d; y = v * CAKE.h; x = (k === 3 ? 1 : -1) * (CAKE.w / 2 - inset); }
      } else {
        let tries = 0;
        do { x = (R() - 0.5) * CAKE.w * 0.98; y = R() * CAKE.h * 0.98; z = (R() - 0.5) * CAKE.d * 0.98; } while (inPiece(x, y, z) && ++tries < 12);
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      rel[i] = frontCoord(x, y) + (R() - 0.5) * 0.14;
      rnd[i * 4] = R(); rnd[i * 4 + 1] = R(); rnd[i * 4 + 2] = R(); rnd[i * 4 + 3] = R();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRel', new THREE.BufferAttribute(rel, 1));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uFront: powderU.uFront, uScale: { value: 800 }, uSize: { value: small ? 0.02 : 0.017 }, uColor: { value: new THREE.Color(0xf1efea) } },
      vertexShader: `
        uniform float uFront, uScale, uSize;
        attribute float aRel; attribute vec4 aRnd;
        varying float vShade;
        void main() {
          float age = max(0.0, uFront - aRel) * 3.2;
          vec3 dir = normalize(vec3(1.0, 0.28 + aRnd.y * 0.55, -0.35 + (aRnd.z - 0.5) * 0.9));
          vec3 p = position + dir * (age * 0.28 + age * age * 0.75);
          p += vec3(0.0, sin(aRnd.x * 6.283 + age * 4.0), cos(aRnd.w * 6.283 + age * 3.0)) * 0.05 * min(age, 1.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float s = 1.0 - smoothstep(0.25, 1.15, age);
          gl_PointSize = s <= 0.0 ? 0.0 : uSize * (0.65 + aRnd.w * 0.7) * s * uScale / -mv.z;
          vShade = 0.86 + aRnd.x * 0.14;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vShade;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
          float d = 0.52 + 0.48 * max(dot(n, normalize(vec3(-0.45, 0.7, 0.55))), 0.0);
          gl_FragColor = vec4(uColor * d * vShade, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  })();
  mj.add(grains);
  const mjShadow = shadow(H3, 2.0, 1.6, -0.062, 0.8);
  const drawSize = new THREE.Vector2();

  /* ---------- etichette ---------- */
  const callouts = [...(ctx.overlay?.querySelectorAll('.callout[data-part]') || [])];
  const anchors = {
    heatsink: [hsG, V(-0.2, 0.2, 0.09)],
    heatbreak: [hbG, V(-0.03, 0.175, 0)],
    heater: [blockG, V(BLK.x0 + 0.02, BLK_Y0 + 0.03, BLK.d / 2)],
    nozzle: [nozG, V(-0.07, 0.03, 0.04)],
    lid: [lidG, V(0.43, 0.7, 0.12)],
    vat: [vatG, V(0.31, P2.FILM + 0.07, P2.VZ + 0.18)],
    screen: [lcdG, V(0.25, 0.166, P2.VZ + 0.16)],
    uvlight: [uvG, V(0.2, 0.12, P2.VZ + 0.13)],
    plate: [zCar, V(0.17, 0.02, 0.12)]
  };

  /* ---------- camera ---------- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const wv = V(), bmin = V(), bmax = V(), tgt = V(), tmp = V();
  const mkView = () => ({ t: V(), d: 1, el: 0 });
  const vA = mkView(), vB = mkView(), vH = [mkView(), mkView(), mkView()], vF = mkView();
  /* centro e distanza perché tutti i punti stiano nella finestra utile (kV, kH = 1 / semi-apertura) */
  const fitView = (fit, el, kV, kH, out) => {
    const pts = fit.w;
    for (let i = 0; i < pts.length; i++) pts[i].copy(fit.list[i][1]).applyMatrix4(fit.list[i][0].matrixWorld);
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
    out.el = el;
  };
  const blendView = (a, b, k, out) => {
    out.t.lerpVectors(a.t, b.t, k);
    out.d = a.d * Math.pow(b.d / a.d, k);
    out.el = lerp(a.el, b.el, k);
    return out;
  };

  /* ricerca sul percorso del cordolo: posizione della testina alla distanza D */
  const headAt = (D, out) => {
    const d = path.d;
    let lo = 0, hi = d.length - 1;
    if (D <= 0) { out.set(path.x[0], 0, path.z[0]); return 1; }
    if (D >= path.total) { out.set(path.x[hi], 0, path.z[hi]); return 1; }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m] <= D) lo = m; else hi = m; }
    const k = (D - d[lo]) / Math.max(1e-6, d[hi] - d[lo]);
    out.set(lerp(path.x[lo], path.x[hi], k), 0, lerp(path.z[lo], path.z[hi], k));
    return path.ext[lo] && path.ext[hi] ? 1 : 0;
  };
  const head = V();
  const COOL_W = new THREE.Color(0xffffff);

  function update(state) {
    const { p, t, w, h, aspect } = state;
    const idle = ctx.reduceMotion ? 0 : 1;
    const px = ctx.reduceMotion ? 0 : state.pointer.x;
    const desk = smoothstep((aspect - 0.85) / 0.2);

    /* pesi di passaggio tra gli eroi */
    const w2 = smoothstep(seg(p, T.x12A, T.x12B)), w3 = smoothstep(seg(p, T.x23A, T.x23B));
    H1.visible = w2 < 0.999;
    H2.visible = w2 > 0.001 && w3 < 0.999;
    H3.visible = w3 > 0.001;

    /* ================= EROE 1 ================= */
    {
      const rec = (i) => 1 - easeInOutCubic(seg(p, T.reA + i * 0.004, T.reB));
      const e = HE_EX.map(([a, b], i) => easeInOutCubic(seg(p, a, b)) * rec(i));
      const eAll = easeInOutCubic(seg(p, 0.05, 0.14)) * (1 - easeInOutCubic(seg(p, T.reA, T.reB)));
      const OFF = [0.8, 0.46, 0.2, -0.24];
      for (let i = 0; i < 4; i++) heGroups[i].position.set(heBase[i].x, heBase[i].y + OFF[i] * e[i], heBase[i].z);
      cartG.position.set(heBase[4].x, heBase[4].y, heBase[4].z + 0.36 * e[4]);
      thermG.position.set(heBase[5].x, heBase[5].y, heBase[5].z + 0.28 * e[5]);
      screwG.position.set(heBase[6].x, heBase[6].y + 0.2 * e[6], heBase[6].z);

      // taglio a spicchio che si apre
      const phi = easeInOutCubic(seg(p, T.cutA, T.cutB)) * Math.PI / 2;
      cutLocal[1].normal.set(Math.cos(phi), 0, -Math.sin(phi));

      // posa: inclinato durante l'esploso (diagonale), dritto per la stampa
      const toPrint = easeInOutCubic(seg(p, T.reA, T.plateB + 0.005));
      const tilt = lerp(lerp(-0.22, -0.5, easeInOutCubic(seg(p, 0.02, 0.13))), 0, toPrint);
      const yaw = -Math.PI / 4 + lerp(0.36, 0.2, toPrint) + (idle ? Math.sin(t * 0.4) * 0.05 + px * 0.1 : 0) * (1 - toPrint * 0.7) - w2 * 0.5;
      heRoot.rotation.set(0, yaw, tilt);

      // stampa
      const prog = seg(p, T.printA, T.printB);
      const D = prog * path.total;
      const ext = headAt(D, head);
      const hop = (1 - ext) * 0.03;
      const lower = easeInOutCubic(seg(p, T.reA + 0.01, T.plateB + 0.01));
      heRoot.position.set(lerp(0, head.x, lower), lerp(0.86, BEAD_H + HE_MID + hop, lower), lerp(0, head.z, lower));
      beadU.uHead.value = prog > 0 ? D : -1;

      // piatto
      const pl = easeInOutCubic(seg(p, T.plateA, T.plateB));
      plG.visible = pl > 0.001;
      plG.position.y = -0.32 * (1 - pl);
      plateGold.opacity = plateTop.opacity = pl;
      plShadow.material.opacity = pl * 0.7;
      heShadow.material.opacity = 0.32 * (1 - pl);
      heShadow.scale.setScalar(lerp(0.7, 1.1, eAll));

      // filamento: entra, fonde, esce
      const feed = easeInOutCubic(seg(p, T.feedA, T.feedB));
      const tipY = lerp(FIL_TOP + 0.02, MELT_TOP - 0.01, feed);
      fil.visible = feed > 0.001;
      fil.scale.y = Math.max(0.001, FIL_TOP - tipY);
      const meltK = easeInOutCubic(seg(p, T.meltA, T.meltB));
      melt.visible = meltK > 0.001;
      const heat = meltK * (1 - easeInOutCubic(seg(p, T.printB + 0.01, T.x12B)));
      meltGlow.material.opacity = heat * (0.55 + (idle ? 0.06 * Math.sin(t * 5) : 0));
      tipGlow.material.opacity = heat * (prog > 0 ? 0.9 : 0.5);
      nozHeat.emissiveIntensity = MH.brassHex.emissiveIntensity = heat * 0.22;
      cartMat.emissiveIntensity = heat * 0.18;
      scene.updateMatrixWorld(true);
      // piano della parte fusa (nello spazio di he: tiene y >= livello di riempimento)
      meltClip.normal.set(0, 1, 0);
      meltClip.constant = -lerp(MELT_TOP, -0.02, meltK);
      meltClip.applyMatrix4(he.matrixWorld);
      for (let i = 0; i < 2; i++) cutW[i].copy(cutLocal[i]).applyMatrix4(he.matrixWorld);
    }

    /* ================= EROE 2 ================= */
    {
      const ex = (k, i = 0) => easeInOutCubic(seg(p, RX[k][0], RX[k][1])) * (1 - easeInOutCubic(seg(p, T.rreA + i * 0.005, T.rreB)));
      const eLid = easeInOutCubic(seg(p, RX.lid[0], RX.lid[1]));
      const lidAway = easeInOutCubic(seg(p, T.rreA, T.rreB));
      lidG.position.set(0, 0.92 * eLid + 0.5 * lidAway, -0.06 * eLid);
      lidG.visible = lidAway < 0.999;
      lidMat.opacity = 0.44 * (1 - lidAway);
      lidEdge.opacity = 1 - lidAway;
      baseG.position.y = -0.36 * ex('base', 6);
      uvG.position.y = -0.18 * ex('uv', 5);
      lcdG.position.y = 0.12 * ex('lcd', 4);
      filmG.position.y = 0.25 * ex('film', 3);
      vatG.position.y = 0.38 * ex('vat', 2);
      // carrello: esploso, poi scende nella vasca e risale stampando
      const eCar = ex('car', 1);
      const dip = easeInOutCubic(seg(p, T.dipA, T.dipB));
      const prog = seg(p, T.rprA, T.rprB);
      const lift = easeInOutCubic(seg(p, T.liftA, T.liftB));
      const printY = P2.FILM + 0.002 + prog * (RAFT + PART_H) + lift * 0.1;
      zCar.position.y = lerp(P2.CAR, printY, dip) + 0.44 * eCar;
      partG.visible = p > T.rprA;
      filmClip.normal.set(0, 1, 0);
      filmClip.constant = -(H2Y + P2.FILM + 0.001);
      // esposizione: la fetta sull'LCD cambia a ogni strato, il bagliore UV pulsa
      const printing = prog > 0 && prog < 1;
      drawLCD(printing ? prog : 0.42);
      drawUI(prog);
      const pulse = printing ? 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(prog * 60 * Math.PI)), 0.5) : 0;
      expoMat.opacity = pulse * 0.8 * seg(p, T.rprA, T.rprA + 0.006);
      const eUV = ex('uv', 5);
      uvGlow.material.opacity = eUV * 0.85;
      uvGlowMat.color.setRGB(0.9, 0.93, 1).multiplyScalar(0.55 + 0.45 * Math.max(eUV, pulse));
      lcdMat.emissiveIntensity = 0.75 + 0.45 * Math.max(pulse, ex('lcd', 4));
      const yaw = -0.62 + seg(p, 0.33, 0.66) * 0.34 + (idle ? Math.sin(t * 0.35) * 0.04 + px * 0.08 : 0) + (1 - w2) * 0.5 - w3 * 0.5;
      pr.rotation.y = yaw;
      prShadow.material.opacity = 0.85;
    }

    /* ================= EROE 3 ================= */
    {
      const front = lerp(-0.2, 1.3, seg(p, T.blowA, T.blowB));
      powderU.uFront.value = front;
      core.visible = front < 1.25;
      grains.visible = front < 1.5;
      const coat = easeInOutCubic(seg(p, T.coatA, T.coatB));
      nylon.color.copy(NY_POWDER).lerp(NY_GREY, coat);
      nylon.roughness = lerp(0.95, 0.82, coat);
      const spinT = idle ? t * 0.25 : 0;
      pieces.forEach((pc, i) => {
        const k = easeInOutCubic(seg(p, T.floatA + i * 0.018, T.floatB - 0.03 + i * 0.01));
        const { a, b } = pc;
        const spin = k * ((p - T.floatA) * 5 + spinT) * (i % 2 ? -1 : 1);
        pc.g.position.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k) + (idle ? Math.sin(t * 0.8 + i * 1.7) * 0.012 * k : 0), lerp(a[2], b[2], k));
        pc.g.rotation.set(lerp(a[3], b[3], k), lerp(a[4], b[4], k) + spin, lerp(a[5], b[5], k));
        const sh = pieceShadows[i];
        sh.position.set(pc.g.position.x, 0.003, pc.g.position.z);
        sh.material.opacity = seg(p, T.blowA + 0.06, T.blowB) * lerp(0.55, 0.22, k);
        sh.scale.setScalar(lerp(0.5, 0.62, k));
      });
      mj.rotation.y = -0.38 + seg(p, 0.66, 1) * 0.3 + (idle ? Math.sin(t * 0.3) * 0.04 + px * 0.08 : 0) + (1 - w3) * 0.5;
      ctx.renderer.getDrawingBufferSize(drawSize);
      grains.material.uniforms.uScale.value = drawSize.y * 0.5 / tanHalf;
    }

    scene.updateMatrixWorld(true);

    /* ================= camera ================= */
    const offX = lerp(0, 0.225, desk), offY = lerp(0.2, 0, desk);
    camera.setViewOffset(w, h, -offX * w, offY * h, w, h);
    const availH = lerp(0.86, 0.44, desk), availV = lerp(0.42, 0.78, desk);
    const kV = 1 / (tanHalf * availV), kH = 1 / (tanHalf * aspect * availH);
    if (w2 < 1) {
      fitView(fitHe, lerp(0.1, 0.16, easeInOutCubic(seg(p, 0.05, 0.14))), kV, kH, vA);
      fitView(fit1B, 0.42, kV, kH, vB);
      blendView(vA, vB, easeInOutCubic(seg(p, T.reA, T.plateB + 0.01)), vH[0]);
    }
    if (w2 > 0 && w3 < 1) {
      fitView(fit2A, 0.3, kV, kH, vA);
      fitView(fit2B, 0.34, kV, kH, vB);
      blendView(vA, vB, easeInOutCubic(seg(p, T.rreA, T.rreB)), vH[1]);
    }
    if (w3 > 0) {
      fitView(fit3A, 0.36, kV, kH, vA);
      fitView(fit3B, 0.2, kV, kH, vB);
      blendView(vA, vB, easeInOutCubic(seg(p, T.floatA - 0.02, T.floatB)), vH[2]);
    }
    if (w2 < 1 && w2 > 0) blendView(vH[0], vH[1], w2, vF);
    else if (w3 > 0 && w3 < 1) blendView(vH[1], vH[2], w3, vF);
    else blendView(w2 >= 1 ? (w3 >= 1 ? vH[2] : vH[1]) : vH[0], w2 >= 1 ? (w3 >= 1 ? vH[2] : vH[1]) : vH[0], 0, vF);
    tgt.copy(vF.t);
    camera.position.set(tgt.x, tgt.y + Math.sin(vF.el) * vF.d, tgt.z + Math.cos(vF.el) * vF.d);
    camera.lookAt(tgt);
    camera.updateMatrixWorld();

    /* ================= etichette ================= */
    if (callouts.length) {
      const cx = ctx.project(tgt).x;
      for (let i = 0; i < callouts.length; i++) {
        const el = callouts[i], an = anchors[el.dataset.part];
        if (!an) continue;
        tmp.copy(an[1]).applyMatrix4(an[0].matrixWorld);
        const s = ctx.project(tmp);
        el.style.setProperty('--x', s.x.toFixed(1) + 'px');
        el.style.setProperty('--y', s.y.toFixed(1) + 'px');
        let side = s.x < cx ? 'left' : 'right';
        if (side === 'right' && s.x > w - 240) side = 'left';
        if (side === 'left' && s.x < 240) side = 'right';
        el.dataset.side = side;
      }
    }
  }

  return {
    scene,
    camera,
    update,
    resize() {},
    dispose() {
      /* le texture stanno tutte sui materiali (le libera il core); qui solo le geometrie sorgente */
      [latticeGeo, gearGeo, bracketGeo, logoGeo, meltGeo, beadGeo, partGeo].forEach((g) => g.dispose());
    }
  };
}
