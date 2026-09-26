/* Tillverka · scena "printer" (#macchina, sfondo bianco).
   Stampante FDM chiusa (CoreXY) modellata a mano: presentazione, vista esplosa generosa a gruppi
   (e sotto-gruppi: testina, piatto, bobine, angoli del telaio), ricomposizione, poi stampa del logo
   in miniatura strato dopo strato.
   Unità: 1 = larghezza della scocca. Origine a terra, al centro sotto la stampante.
   Prestazioni: pochi shader (materiali condivisi), geometrie statiche fuse per materiale (bake). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seg, smoothstep, easeInOutCubic, lerp } from './core.js';
import { mat, COLORS, radialTexture, layerLinesTexture } from './materials.js';
import { FACE, CHANNEL, pieceAngle, pieceShapes } from './logo-shape.js';

/* ---------- misure ---------- */
const W = 1.0, D = 0.96;             // scocca: larghezza, profondità
const FOOT = 0.035;                  // altezza piedini
const BASE_TOP = 0.17;               // piano superiore della base
const TOP = 1.12;                    // sommità del telaio
const POST = 0.056;                  // profilo in alluminio
const PX = W / 2 - POST / 2, PZ = D / 2 - POST / 2;
const NZ = 0.872;                    // punta dell'ugello (quota)
const RAIL_Y = 1.035;                // guide Y
const BELT_Y = 1.062;
const BED_REST = 0.5;                // piatto a riposo
const PLINTH_H = 0.02;               // basetta del pezzo stampato
const LOGO_H = 0.4;
const PRINT_H = PLINTH_H - 0.005 + LOGO_H;
const LAYER = 0.0024;                // passo visivo degli strati
const UB = 0.17, UW = 0.94, UD = 0.5; // unità bobine: altezza corpo, larghezza, profondità

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* chiavi (p, valore) per rotazione, elevazione della camera e margine d'inquadratura */
const ROT_KEYS = [[0, -0.8], [0.12, -0.66], [0.3, -0.56], [0.44, -0.5], [0.5, -0.44], [0.64, -0.5], [0.8, -0.44], [1, -0.38]];
const EL_KEYS = [[0, 0.2], [0.12, 0.22], [0.3, 0.3], [0.5, 0.3], [0.62, 0.22], [0.74, 0.14], [1, 0.12]];
const FIT_KEYS = [[0, 0.93], [0.12, 0.92], [0.5, 0.92], [0.64, 0.86], [1, 1]];

/* ---------- attrezzi geometrici ---------- */
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
/* gruppo che si muove da solo (un "pezzo" dell'esploso): il bake si ferma ai suoi confini */
function part(parent, x = 0, y = 0, z = 0) {
  const g = group(parent, x, y, z);
  g.userData.anim = true;
  return g;
}
/* cilindro tornito con spigoli arrotondati (asse Y, centrato) */
function roundCyl(r, h, rr, seg = 32, inner = 0) {
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
  return new THREE.LatheGeometry(pts, seg);
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
/* cornice serigrafata nera dei vetri (piano XY) */
function fritGeo(w, h, bw, r) {
  const s = roundRectPath(new THREE.Shape(), w, h, r);
  s.holes.push(roundRectPath(new THREE.Path(), w - 2 * bw, h - 2 * bw, r * 0.7));
  return new THREE.ShapeGeometry(s, 6);
}
/* profilo di alluminio con cave a T sulle 4 facce, estruso lungo Z e centrato */
function profileGeo(len, a = POST) {
  const h = a / 2, sw = a * 0.13, dp = a * 0.16, r = a * 0.1;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(-sw, -h); s.lineTo(-sw, -h + dp); s.lineTo(sw, -h + dp); s.lineTo(sw, -h);
  s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, -sw); s.lineTo(h - dp, -sw); s.lineTo(h - dp, sw); s.lineTo(h, sw);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(sw, h); s.lineTo(sw, h - dp); s.lineTo(-sw, h - dp); s.lineTo(-sw, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, sw); s.lineTo(-h + dp, sw); s.lineTo(-h + dp, -sw); s.lineTo(-h, -sw);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -len / 2);
  return g;
}
/* piastra con foro tondo (cover della testina, telaio della ventola), estrusa lungo Z */
function holedPlate(w, h, r, holeR, hx, hy, depth, bevel) {
  const s = roundRectPath(new THREE.Shape(), w, h, r);
  const hole = new THREE.Path();
  hole.absarc(hx, hy, holeR, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 28 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/* filo sottile lungo una curva (cavi della testina e del piatto) */
function wire(pts, r = 0.0011) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => V(x, y, z)));
  return new THREE.TubeGeometry(c, 20, r, 5, false);
}

/* fonde le mesh statiche di un gruppo per materiale (meno draw call); si ferma ai sotto-pezzi animati */
const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4();
function bake(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  const walk = (o) => {
    for (const c of o.children) {
      if (c.userData.anim) continue;
      if (c.isMesh && !c.isInstancedMesh && !c.userData.keep && c.renderOrder === 0 && !c.children.length) {
        if (!buckets.has(c.material)) buckets.set(c.material, []);
        buckets.get(c.material).push(c);
      } else walk(c);
    }
  };
  walk(root);
  for (const [m, list] of buckets) {
    if (list.length < 2) continue;
    const geos = list.map((c) => {
      const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      g.applyMatrix4(_rel.multiplyMatrices(_inv, c.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    list.forEach((c) => c.removeFromParent());
    root.add(new THREE.Mesh(merged, m));
  }
}

/* ---------- texture procedurali ---------- */
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
/* PEI testurizzato: grana fine */
function peiTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 150;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
  }, false);
}
/* filettatura della vite (righe oblique) */
function threadTexture() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 9;
    for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32 + 16); g.stroke(); }
  }, false);
}
/* alluminio spazzolato: striature sottili */
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

/* tubo PTFE con forma aggiornabile (curva di Bézier, vertici riscritti senza allocare) */
function makeTube(material, radius, segs, radial) {
  const nV = (segs + 1) * (radial + 1);
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), uv = new Float32Array(nV * 2);
  const idx = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) {
    const k = (i * (radial + 1) + j) * 2;
    uv[k] = i / segs; uv[k + 1] = j / radial;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const curve = new THREE.CubicBezierCurve3(V(), V(), V(), V());
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.userData.keep = true;
  const P = V(), T = V(), N = V(), B = V(), tmp = V();
  /* a, b = estremi; da, db = direzioni d'uscita (già scalate) */
  function set(a, da, b, db) {
    curve.v0.copy(a); curve.v1.copy(a).add(da);
    curve.v2.copy(b).add(db); curve.v3.copy(b);
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      curve.getPoint(u, P);
      curve.getTangent(u, T).normalize();
      if (i === 0) {
        tmp.set(0, 1, 0);
        if (Math.abs(T.y) > 0.9) tmp.set(1, 0, 0);
        N.crossVectors(T, tmp).normalize();
      } else {
        N.addScaledVector(T, -N.dot(T)).normalize();
      }
      B.crossVectors(T, N);
      for (let j = 0; j <= radial; j++) {
        const an = (j / radial) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
        const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
        const k = (i * (radial + 1) + j) * 3;
        pos[k] = P.x + nx * radius; pos[k + 1] = P.y + ny * radius; pos[k + 2] = P.z + nz * radius;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
  return { mesh, set };
}

/* disegna il triscele su un canvas 2D (coordinate SVG, y in basso) */
function drawTriskele(g, cx, cy, scale, face, line) {
  g.save();
  g.translate(cx, cy);
  g.scale(scale, scale);
  for (let k = 0; k < 3; k++) {
    g.save();
    g.rotate(k * (2 * Math.PI / 3));
    g.beginPath(); FACE.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = face; g.fill();
    g.beginPath(); CHANNEL.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = line; g.fill();
    g.lineWidth = 0.035; g.strokeStyle = face; g.stroke();
    g.restore();
  }
  g.restore();
}

/* interpolazione a chiavi con passaggi morbidi (niente allocazioni) */
function track(p, keys) {
  if (p <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const k0 = keys[i - 1], k1 = keys[i];
      return lerp(k0[1], k1[1], smoothstep((p - k0[0]) / (k1[0] - k0[0])));
    }
  }
  return keys[keys.length - 1][1];
}
/* esce in [a0, a1], rientra in [b0, b1] */
const outIn = (p, a0, a1, b0, b1) => easeInOutCubic(seg(p, a0, a1)) * (1 - easeInOutCubic(seg(p, b0, b1)));
/* sotto-fase di un valore già 0..1 */
const sub = (e, a, b) => smoothstep((e - a) / (b - a));

/* ======================================================================= */
export async function create(ctx) {
  const small = ctx.small;
  const CS = small ? 18 : 30;                 // suddivisioni dei solidi di rotazione
  ctx.renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

  /* luci: key morbida, rim fredda, fill emisferica */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8cbd2, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(-2.6, 4.2, 3.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xf3f6ff, 1.3);
  rim.position.set(3.2, 2.6, -3.6);
  scene.add(rim);

  /* ---------- materiali: poche "famiglie" di shader, condivise ----------
     P  = fisico con clearcoat, senza mappe      PB = come P + bumpMap
     G  = vetro trasparente                      luci = MeshBasic fuori dal tone mapping */
  const brushed = brushedTexture();
  const threadTex = threadTexture();
  threadTex.repeat.set(1, 90);
  const grooves = layerLinesTexture(48);
  grooves.repeat.set(1, 3);
  const pei = peiTexture();
  pei.repeat.set(3, 3);
  const phys = (o) => new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.4, envMapIntensity: 0.8, ...o });
  const glassOf = (o) => mat.glass({ color: 0x2f3238, opacity: 0.34, roughness: 0.02, envMapIntensity: 1.8, side: THREE.FrontSide, ...o });
  const M = {
    shell: phys({ color: 0x202125, metalness: 0.2, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.75 }),
    shellSoft: phys({ color: 0x2a2b30, metalness: 0.25, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.25, envMapIntensity: 0.85 }),
    aluBright: mat.satinSilver({ color: 0xe2e5ea, roughness: 0.18, clearcoat: 0.1, clearcoatRoughness: 0.3 }),
    chrome: mat.liquidSilver({ roughness: 0.05 }),
    gold: mat.gold(),
    brass: mat.gold({ color: 0xcfa45a, roughness: 0.24 }),
    rubber: phys({ color: 0x111113, roughness: 0.85, clearcoat: 0.05, clearcoatRoughness: 0.9, envMapIntensity: 0.4 }),
    black: phys({ color: 0x0b0b0d, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.6 }),
    white: phys({ color: 0xe8e8e6, roughness: 0.5 }),
    ptfe: phys({ color: 0xeef0f2, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.9 }),
    pcb: phys({ color: 0x17221d, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.7 }),
    flange: phys({ color: 0x1a1b1e, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.9 }),
    magnet: phys({ color: 0x3a3b40, metalness: 0.3, roughness: 0.55, clearcoat: 0.2 }),
    pedestal: phys({ color: 0xf7f7f9, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 }),
    alu: mat.satinSilver({ roughness: 0.26, bumpMap: brushed, bumpScale: 0.15, clearcoat: 0.1, clearcoatRoughness: 0.3 }),
    screw: mat.liquidSilver({ roughness: 0.18, bumpMap: threadTex, bumpScale: 1.2 }),
    pei: phys({ color: 0x2a2b2f, roughness: 0.62, metalness: 0.1, bumpMap: pei, bumpScale: 0.35, clearcoat: 0.05, clearcoatRoughness: 0.8 }),
    glass: glassOf(),
    glassDoor: glassOf(),
    glassLid: glassOf({ opacity: 0.28 }),
    glassUnit: glassOf({ color: 0x15171a, opacity: 0.14, envMapIntensity: 2.2 }),
    ledGreen: mat.glow(COLORS.bamboo),
    ledWarm: mat.glow(0xfff1d6),
    glowTip: mat.glow(COLORS.glow),
    glowWhite: mat.glow(0xffffff),
    glowRing: mat.glow(0xf3d9a4),
    bead: mat.glow(0xffd28a)
  };
  const flat = (map, o) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, ...o });

  const model = part(scene);           // tutta la stampante (ruota su Y)
  const frame = part(model);           // telaio: resta fermo, è il riferimento

  /* ---------- piedistallo di luce + ombre di contatto ---------- */
  const PED_R = 0.8;
  const floor = part(scene);
  add(floor, roundCyl(PED_R, 0.026, 0.011, 96), M.pedestal, 0, -0.013, 0);
  // faccia superiore luminosa (bianco pieno, fuori dal tone mapping) e filo caldo sul bordo
  add(floor, new THREE.CircleGeometry(PED_R - 0.011, 96), M.glowWhite, 0, 0.0004, 0, -Math.PI / 2);
  add(floor, new THREE.TorusGeometry(PED_R - 0.006, 0.0018, 6, 160), M.glowRing, 0, 0.0006, 0, Math.PI / 2);
  add(floor, new THREE.PlaneGeometry(2.5, 2.5), flat(radialTexture([[0, 'rgba(24,26,32,0.22)'], [0.5, 'rgba(24,26,32,0.12)'], [0.72, 'rgba(24,26,32,0.03)'], [1, 'rgba(24,26,32,0)']])),
    0, -0.027, 0, -Math.PI / 2).userData.keep = true;
  const contact = add(model, new THREE.PlaneGeometry(1.45, 1.45), flat(radialTexture([[0, 'rgba(10,10,14,0.5)'], [0.42, 'rgba(10,10,14,0.34)'], [0.62, 'rgba(10,10,14,0.1)'], [1, 'rgba(10,10,14,0)']])),
    0, 0.0012, 0, -Math.PI / 2);
  contact.renderOrder = 1;

  /* ================= TELAIO ================= */
  add(frame, rbox(W + 0.012, BASE_TOP - FOOT, D + 0.012, 0.03, 4), M.shell, 0, (FOOT + BASE_TOP) / 2, 0);
  add(frame, rbox(W + 0.004, 0.006, D + 0.004, 0.003, 2), M.aluBright, 0, BASE_TOP - 0.001, 0);
  // feritoie di ventilazione sui fianchi della base
  {
    const slot = rbox(0.004, 0.06, 0.03, 0.0019, 2);
    const n = 12, inst = new THREE.InstancedMesh(slot, M.black, n * 2);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const z = -0.26 + (i / (n - 1)) * 0.52;
      m4.makeTranslation(W / 2 + 0.0055, 0.1, z); inst.setMatrixAt(i, m4);
      m4.makeTranslation(-W / 2 - 0.0055, 0.1, z); inst.setMatrixAt(n + i, m4);
    }
    frame.add(inst);
  }
  const footGeo = roundCyl(0.045, FOOT + 0.01, 0.008, CS);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(frame, footGeo, M.rubber, sx * (W / 2 - 0.09), FOOT / 2, sz * (D / 2 - 0.09)));
  // montanti e traverse in alluminio
  const postLen = TOP - BASE_TOP;
  const postGeo = profileGeo(postLen);
  const barX = profileGeo(2 * PX - POST - 0.002), barZ = profileGeo(2 * PZ - POST - 0.002);
  const slotStrip = new THREE.BoxGeometry(POST * 0.2, postLen - 0.01, 0.002);
  const caps = [];
  const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  CORNERS.forEach(([sx, sz]) => {
    add(frame, postGeo, M.alu, sx * PX, BASE_TOP + postLen / 2, sz * PZ, -Math.PI / 2);
    // fondo delle cave: striscia scura (si leggono come fessure)
    add(frame, slotStrip, M.black, sx * PX, BASE_TOP + postLen / 2, sz * (PZ + POST / 2 - POST * 0.16 + 0.0012));
    add(frame, slotStrip, M.black, sx * (PX + POST / 2 - POST * 0.16 + 0.0012), BASE_TOP + postLen / 2, sz * PZ, 0, Math.PI / 2);
    // tappo d'angolo (nell'esploso si alza e mostra la vite)
    const cap = part(frame, sx * PX, TOP + 0.004, sz * PZ);
    add(cap, rbox(POST + 0.006, 0.022, POST + 0.006, 0.008, 3), M.shellSoft);
    add(cap, rbox(POST - 0.01, 0.003, POST - 0.01, 0.0014, 2), M.aluBright, 0, 0.0115, 0);
    caps.push(cap);
    // squadrette interne agli angoli bassi
    add(frame, rbox(0.03, 0.03, 0.006, 0.003, 2), M.aluBright, sx * (PX - POST / 2 - 0.016), BASE_TOP + POST + 0.016, sz * (PZ - POST / 2 + 0.004));
  });
  [BASE_TOP + POST / 2, TOP - POST / 2].forEach((y) => {
    [-1, 1].forEach((s) => {
      add(frame, barX, M.alu, 0, y, s * PZ, 0, Math.PI / 2);
      add(frame, barZ, M.alu, s * PX, y, 0);
    });
  });
  // viti a brugola sulle traverse (instanced)
  {
    const headG = roundCyl(0.0065, 0.004, 0.0015, 16);
    const sock = new THREE.CylinderGeometry(0.0028, 0.0028, 0.0012, 6);
    const pts = [];
    [BASE_TOP + POST / 2, TOP - POST / 2].forEach((y) => [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      pts.push([sx * (PX - POST / 2 - 0.018), y, sz * (D / 2 + 0.001), 'z', sz]);
      pts.push([sx * (W / 2 + 0.001), y, sz * (PZ - POST / 2 - 0.018), 'x', sx]);
    })));
    const ih = new THREE.InstancedMesh(headG, M.aluBright, pts.length);
    const is = new THREE.InstancedMesh(sock, M.black, pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = V(1, 1, 1), p = V(), n = V();
    pts.forEach(([x, y, z, ax, sg], i) => {
      n.set(ax === 'x' ? sg : 0, 0, ax === 'z' ? sg : 0);
      q.setFromUnitVectors(V(0, 1, 0), n);
      p.set(x, y, z); m4.compose(p, q, s1); ih.setMatrixAt(i, m4);
      p.addScaledVector(n, 0.0018); m4.compose(p, q, s1); is.setMatrixAt(i, m4);
    });
    frame.add(ih, is);
  }
  // viti lunghe degli angoli (sotto i tappi): testa, esagono, gambo filettato
  const capScrew = {
    head: new THREE.InstancedMesh(roundCyl(0.0095, 0.006, 0.0022, 18), M.aluBright, 4),
    sock: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0014, 6), M.black, 4),
    shank: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.06, 12), M.chrome, 4)
  };
  Object.values(capScrew).forEach((m) => { m.frustumCulled = false; frame.add(m); });
  // pavimento della camera
  add(frame, rbox(2 * PX - POST, 0.006, 2 * PZ - POST, 0.003, 2), M.shellSoft, 0, BASE_TOP + 0.003, 0);
  // guide verticali Z (dietro) + vite trapezia centrale
  const zRodGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.8, CS);
  [-0.26, 0.26].forEach((x) => {
    add(frame, zRodGeo, M.chrome, x, BASE_TOP + 0.41, -0.405);
    add(frame, rbox(0.05, 0.03, 0.04, 0.008), M.shellSoft, x, 0.98, -0.412);
    add(frame, rbox(0.05, 0.03, 0.04, 0.008), M.shellSoft, x, BASE_TOP + 0.02, -0.412);
  });
  add(frame, new THREE.CylinderGeometry(0.0075, 0.0075, 0.8, CS), M.screw, 0, BASE_TOP + 0.41, -0.405);
  add(frame, roundCyl(0.014, 0.03, 0.004, CS), M.aluBright, 0, BASE_TOP + 0.02, -0.405);
  // luce della camera (barra LED sotto la traversa anteriore)
  add(frame, rbox(0.56, 0.006, 0.012, 0.003, 2), M.ledWarm, 0, TOP - POST - 0.006, PZ - 0.03);
  // raccordo PTFE sul retro (in alto a destra)
  const hub = group(frame, 0.3, TOP - 0.05, -D / 2 - 0.022);
  add(hub, rbox(0.1, 0.035, 0.03, 0.01), M.shellSoft);
  for (let i = 0; i < 4; i++) add(hub, roundCyl(0.0075, 0.014, 0.002, 16), M.aluBright, -0.036 + i * 0.024, 0.024, 0);
  add(hub, roundCyl(0.008, 0.014, 0.002, 16), M.aluBright, 0, 0, 0.02, Math.PI / 2);

  /* ================= INVOLUCRO ================= */
  const enclosure = group(model);
  const panelH = TOP - BASE_TOP - 0.004, panelY = (TOP + BASE_TOP) / 2;
  /* riflessi "da studio" sul vetro: bande diagonali morbide */
  const streakTex = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const band = (x0, wd, a) => {
      const gr = g.createLinearGradient(x0, 0, x0 + wd, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x0, 0, wd, h);
    };
    g.setTransform(1, 0, -0.55, 1, 0, 0);
    g.translate(70, 0);
    band(30, 90, 0.5); band(132, 8, 0.75);
  });
  streakTex.wrapS = streakTex.wrapT = THREE.ClampToEdgeWrapping;
  const streakMat = flat(streakTex, { opacity: 0.32 });
  function glassPanel(parent, w, h, material, bw = 0.034) {
    const g = group(parent);
    add(g, rbox(w, h, 0.008, 0.0038, 2), material);
    add(g, fritGeo(w - 0.004, h - 0.004, bw, 0.012), M.black, 0, 0, -0.0042);
    const st = add(g, new THREE.PlaneGeometry(w - 2 * bw, h - 2 * bw), streakMat, 0, 0, 0.0046);
    st.renderOrder = 2;
    return Object.assign(g, { streak: st });
  }
  const left = part(enclosure, -W / 2 - 0.005, panelY, 0);
  glassPanel(left, 2 * PZ, panelH, M.glass).rotation.y = -Math.PI / 2;
  const right = part(enclosure, W / 2 + 0.005, panelY, 0);
  const rg = glassPanel(right, 2 * PZ, panelH, M.glass);
  rg.rotation.y = Math.PI / 2;
  rg.streak.scale.x = -1;
  // retro: pannello pieno con feritoie e ventola di estrazione
  const back = part(enclosure, 0, panelY, -D / 2 - 0.006);
  add(back, rbox(2 * PX, panelH, 0.01, 0.004, 2), M.shell);
  {
    const ventGeo = rbox(0.12, 0.008, 0.004, 0.0019, 2);
    const inst = new THREE.InstancedMesh(ventGeo, M.black, 16);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 16; i++) { m4.makeTranslation((i % 2 ? 0.08 : -0.08), 0.25 - Math.floor(i / 2) * 0.02, 0.0045); inst.setMatrixAt(i, m4); }
    back.add(inst);
    const fan = group(back, 0, 0.3, 0.008);
    add(fan, new THREE.CircleGeometry(0.06, 40), M.black, 0, 0, 0.0005);
    [0.02, 0.035, 0.05].forEach((r) => add(fan, new THREE.TorusGeometry(r, 0.0016, 6, 48), M.shellSoft, 0, 0, 0.002));
    add(fan, roundCyl(0.013, 0.006, 0.002, 24), M.shellSoft, 0, 0, 0.003, Math.PI / 2);
  }
  // porta frontale in vetro con maniglia e cerniere
  const door = part(enclosure, 0, panelY, D / 2 + 0.005);
  glassPanel(door, 2 * PX, panelH, M.glassDoor, 0.03);
  const handle = group(door, PX - 0.06, 0.02, 0.012);
  add(handle, rbox(0.016, 0.24, 0.016, 0.0075, 3), M.aluBright, 0, 0, 0.012);
  add(handle, roundCyl(0.006, 0.02, 0.002, 16), M.aluBright, 0, 0.1, 0, Math.PI / 2);
  add(handle, roundCyl(0.006, 0.02, 0.002, 16), M.aluBright, 0, -0.1, 0, Math.PI / 2);
  [-0.34, 0.34].forEach((y) => add(door, roundCyl(0.009, 0.06, 0.003, 20), M.aluBright, -PX + 0.004, y, 0.006));
  // coperchio in vetro
  const lid = part(enclosure, 0, TOP + 0.0075, 0);
  glassPanel(lid, 2 * PX - 0.004, 2 * PZ - 0.004, M.glassLid, 0.045).rotation.x = -Math.PI / 2;

  /* ================= BOBINE (unità multimateriale) ================= */
  const spools = part(model, 0, TOP + 0.013, 0);
  add(spools, rbox(UW, UB, UD, 0.045, 4), M.shell, 0, UB / 2, 0);
  add(spools, rbox(UW - 0.02, 0.006, UD - 0.02, 0.003, 2), M.aluBright, 0, 0.003, 0);
  // coperchio incernierato dietro (si apre all'indietro)
  const uLid = part(spools, 0, UB - 0.004, -UD / 2);
  add(uLid, rbox(UW, 0.225, UD, 0.06, 4), M.glassUnit, 0, 0.1125, UD / 2);
  add(uLid, rbox(UW - 0.004, 0.012, UD - 0.004, 0.006, 2), M.shellSoft, 0, 0.006, UD / 2);
  add(uLid, rbox(0.16, 0.01, 0.014, 0.005, 2), M.aluBright, 0, 0.014, UD + 0.004);
  [-0.3, 0.3].forEach((x) => add(uLid, roundCyl(0.009, 0.06, 0.003, 16), M.aluBright, x, 0.006, 0.002, 0, 0, Math.PI / 2));
  const windMats = [
    mat.liquidSilver({ roughness: 0.2, bumpMap: grooves, bumpScale: 0.6 }),
    mat.gold({ roughness: 0.28, bumpMap: grooves, bumpScale: 0.6 }),
    mat.bambooGreen({ roughness: 0.42, bumpMap: grooves, bumpScale: 0.6 }),
    phys({ color: 0x121214, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, bumpMap: grooves, bumpScale: 0.6 })
  ];
  const flangeGeo = (() => {
    const s = new THREE.Shape(); s.absarc(0, 0, 0.172, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.027, 0, Math.PI * 2, true); s.holes.push(hole);
    for (let i = 0; i < 6; i++) {    // finestre a spicchio
      const a0 = (i / 6) * Math.PI * 2 + 0.12, a1 = a0 + Math.PI * 2 / 6 - 0.24;
      const h = new THREE.Path();
      h.absarc(0, 0, 0.145, a0, a1, false);
      h.absarc(0, 0, 0.06, a1, a0, true);
      h.closePath();
      s.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2, curveSegments: small ? 24 : 40 });
    g.translate(0, 0, -0.003);
    return g;
  })();
  const windGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.142, small ? 40 : 64, 1, false);
  const hubGeo = roundCyl(0.06, 0.15, 0.004, CS, 0.026);
  const spoolObjs = [];
  for (let i = 0; i < 4; i++) {
    const sp = part(spools, -0.3225 + i * 0.215, UB + 0.02, 0);
    const spin = part(sp);
    add(spin, windGeo, windMats[i], 0, 0, 0, 0, 0, Math.PI / 2);
    add(spin, hubGeo, M.shellSoft, 0, 0, 0, 0, 0, Math.PI / 2);
    add(spin, flangeGeo, M.flange, 0.076, 0, 0, 0, Math.PI / 2);
    add(spin, flangeGeo, M.flange, -0.076, 0, 0, 0, Math.PI / 2);
    // capo del filo che esce dalla bobina
    add(spin, new THREE.CylinderGeometry(0.0022, 0.0022, 0.05, 6), windMats[i], 0.03, 0.15, 0.02, 0.4, 0, 0);
    spoolObjs.push({ g: sp, spin, x: sp.position.x });
    add(spools, rbox(0.03, 0.005, 0.004, 0.002, 2), M.ledGreen, sp.position.x, 0.05, UD / 2 + 0.0005);
  }
  // attacchi PTFE sul retro dell'unità
  const portPos = [];
  for (let i = 0; i < 4; i++) {
    const x = -0.075 + i * 0.05;
    add(spools, roundCyl(0.008, 0.016, 0.002, 16), M.aluBright, x, 0.1, -UD / 2 - 0.004, Math.PI / 2);
    portPos.push(V(x, 0.1, -UD / 2 - 0.012));
  }

  /* ================= ASSI CoreXY ================= */
  const gantry = part(model);
  const railGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.82, CS);
  [-1, 1].forEach((s) => {
    const x = s * 0.412;
    add(gantry, railGeo, M.chrome, x, RAIL_Y, 0, Math.PI / 2);
    add(gantry, rbox(0.045, 0.05, 0.03, 0.01), M.shellSoft, x + s * 0.012, RAIL_Y, 0.415);
    add(gantry, rbox(0.045, 0.05, 0.03, 0.01), M.shellSoft, x + s * 0.012, RAIL_Y, -0.415);
    // motore passo-passo (dietro) con calotte argento
    const mot = group(gantry, s * 0.395, 1.0, -0.39);
    add(mot, rbox(0.068, 0.05, 0.068, 0.008), M.shell, 0, 0, 0);
    add(mot, rbox(0.071, 0.012, 0.071, 0.006), M.aluBright, 0, 0.031, 0);
    add(mot, rbox(0.071, 0.012, 0.071, 0.006), M.aluBright, 0, -0.031, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add(mot, roundCyl(0.004, 0.003, 0.001, 12), M.black, a * 0.026, 0.038, b * 0.026));
    add(mot, new THREE.CylinderGeometry(0.0035, 0.0035, 0.04, 12), M.chrome, 0, 0.05, 0);
    add(mot, roundCyl(0.011, 0.02, 0.003, 24), M.aluBright, 0, BELT_Y - 1.0, 0);
    add(mot, rbox(0.024, 0.014, 0.012, 0.003), M.white, s * 0.03, -0.012, 0.0, 0, Math.PI / 2);
    // puleggia di rinvio davanti
    add(gantry, roundCyl(0.011, 0.02, 0.003, 24), M.aluBright, s * 0.395, BELT_Y, 0.39);
    add(gantry, rbox(0.04, 0.008, 0.04, 0.003), M.shellSoft, s * 0.395, BELT_Y + 0.016, 0.39);
    // cinghie laterali (due tratti)
    [-1, 1].forEach((t) => add(gantry, new THREE.BoxGeometry(0.0025, 0.012, 0.78), M.rubber, s * 0.395 + t * 0.0115, BELT_Y, 0));
  });
  // trave X (si muove in profondità con la testina)
  const beam = part(gantry);
  const xRodGeo = new THREE.CylinderGeometry(0.0072, 0.0072, 0.79, CS);
  add(beam, xRodGeo, M.chrome, 0, 1.047, 0, 0, 0, Math.PI / 2);
  add(beam, xRodGeo, M.chrome, 0, 1.005, 0, 0, 0, Math.PI / 2);
  [-1, 1].forEach((s) => {
    add(beam, rbox(0.05, 0.085, 0.085, 0.012), M.shellSoft, s * 0.412, 1.03, 0);
    add(beam, roundCyl(0.009, 0.018, 0.003, 20), M.aluBright, s * 0.395, BELT_Y + 0.03, 0.03);
  });
  [-0.03, -0.042].forEach((z) => add(beam, new THREE.BoxGeometry(0.76, 0.012, 0.0025), M.rubber, 0, BELT_Y, z));
  const carriage = part(beam);
  add(carriage, rbox(0.078, 0.078, 0.032, 0.01), M.alu, 0, 1.026, 0);
  add(carriage, rbox(0.06, 0.012, 0.036, 0.004), M.shellSoft, 0, 1.072, 0);

  /* ================= TESTINA (origine = punta dell'ugello) =================
     sotto-pezzi: piastra dietro, dissipatore, blocco riscaldante, ugello, ventola, griglia, cover */
  const head = part(model);
  const hBack = part(head), hSink = part(head), hHeater = part(head), hNozzle = part(head);
  const hFan = part(head), hGrille = part(head), hCover = part(head);
  // piastra posteriore con viti e connettore
  add(hBack, rbox(0.1, 0.135, 0.01, 0.004, 2), M.shell, 0, 0.0975, -0.04);
  [[-0.036, 0.15], [0.036, 0.15], [-0.036, 0.045], [0.036, 0.045]].forEach(([x, y]) => add(hBack, roundCyl(0.0042, 0.003, 0.001, 12), M.aluBright, x, y, -0.0345, Math.PI / 2));
  add(hBack, rbox(0.026, 0.016, 0.007, 0.002, 2), M.white, 0.022, 0.128, -0.033);
  // dissipatore alettato + heatbreak + raccordo del tubo
  add(hSink, rbox(0.032, 0.088, 0.028, 0.004, 2), M.aluBright, 0, 0.106, 0);
  for (let i = 0; i < 9; i++) add(hSink, rbox(0.056, 0.0026, 0.034, 0.0012, 1), M.aluBright, 0, 0.07 + i * 0.0095, 0);
  add(hSink, new THREE.CylinderGeometry(0.0032, 0.0032, 0.032, 14), M.chrome, 0, 0.047, 0);
  add(hSink, roundCyl(0.0085, 0.014, 0.003, 18), M.aluBright, 0, 0.157, 0);
  add(hSink, roundCyl(0.0062, 0.005, 0.0015, 18), M.black, 0, 0.166, 0);
  // blocco riscaldante: cartuccia, termistore, cavetti
  add(hHeater, rbox(0.034, 0.018, 0.03, 0.003, 2), M.aluBright, 0, 0.024, 0);
  add(hHeater, new THREE.CylinderGeometry(0.0042, 0.0042, 0.042, 14), M.chrome, 0.003, 0.024, 0.006, 0, 0, Math.PI / 2);
  add(hHeater, new THREE.CylinderGeometry(0.0017, 0.0017, 0.014, 8), M.black, -0.008, 0.019, -0.009, 0, 0, Math.PI / 2);
  [[-0.009, 0.032], [0.009, 0.032]].forEach(([x, y]) => add(hHeater, roundCyl(0.0026, 0.002, 0.0008, 10), M.black, x, y, 0.0152, Math.PI / 2));
  add(hHeater, wire([[0.024, 0.026, 0.008], [0.034, 0.04, 0.006], [0.034, 0.075, -0.012], [0.03, 0.1, -0.026]]), M.black);
  add(hHeater, wire([[0.024, 0.022, 0.004], [0.037, 0.036, 0.002], [0.037, 0.07, -0.016], [0.033, 0.095, -0.03]]), M.black);
  add(hHeater, wire([[-0.015, 0.019, -0.009], [-0.03, 0.03, -0.012], [-0.034, 0.07, -0.02], [-0.03, 0.1, -0.03]], 0.0009), M.white);
  // ugello in ottone dorato: filetto, esagono, punta
  add(hNozzle, new THREE.CylinderGeometry(0.0032, 0.0032, 0.018, 14), M.gold, 0, 0.021, 0);
  add(hNozzle, new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 6), M.gold, 0, 0.0115, 0);
  add(hNozzle, new THREE.CylinderGeometry(0.0055, 0.0014, 0.009, 20), M.gold, 0, 0.0045, 0);
  const tip = add(hNozzle, new THREE.SphereGeometry(0.0022, 12, 8), M.glowTip, 0, 0.0005, 0);
  tip.userData.keep = true;
  // ventola dell'hotend: telaio con foro + rotore a pale
  add(hFan, holedPlate(0.05, 0.05, 0.006, 0.0225, 0, 0, 0.01, 0.001), M.shell, 0, 0.112, 0.03);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add(hFan, roundCyl(0.0026, 0.012, 0.001, 10), M.aluBright, a * 0.019, 0.112 + b * 0.019, 0.03, Math.PI / 2));
  const rotor = part(hFan, 0, 0.112, 0.03);
  add(rotor, roundCyl(0.0085, 0.009, 0.002, 20), M.shellSoft, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    const bl = group(rotor);
    bl.rotation.z = (i / 7) * Math.PI * 2;
    add(bl, rbox(0.013, 0.0068, 0.0014, 0.0006, 1), M.shellSoft, 0.0148, 0, 0, 0.55, 0, 0.18);
  }
  // griglia davanti alla ventola
  [0.01, 0.017, 0.024].forEach((r) => add(hGrille, new THREE.TorusGeometry(r, 0.0012, 6, 40), M.aluBright, 0, 0.112, 0.046));
  for (let i = 0; i < 3; i++) add(hGrille, new THREE.BoxGeometry(0.05, 0.002, 0.0018), M.aluBright, 0, 0.112, 0.046, 0, 0, (i / 3) * Math.PI);
  add(hGrille, roundCyl(0.006, 0.004, 0.0015, 20), M.aluBright, 0, 0.112, 0.047, Math.PI / 2);
  // cover: frontale con foro, fianchi, cielo, convogliatore, led
  add(hCover, holedPlate(0.1, 0.135, 0.02, 0.025, 0, 0.0145, 0.006, 0.002), M.shell, 0, 0.0975, 0.042);
  add(hCover, new THREE.TorusGeometry(0.025, 0.0013, 6, 40), M.aluBright, 0, 0.112, 0.0465);
  [-1, 1].forEach((s) => add(hCover, rbox(0.007, 0.135, 0.084, 0.003, 2), M.shell, s * 0.0465, 0.0975, 0.001));
  add(hCover, rbox(0.1, 0.007, 0.084, 0.003, 2), M.shell, 0, 0.1615, 0.001);
  add(hCover, rbox(0.09, 0.012, 0.03, 0.005, 2), M.shellSoft, 0, 0.036, 0.028);
  [-1, 1].forEach((s) => add(hCover, rbox(0.012, 0.016, 0.018, 0.004, 2), M.shellSoft, s * 0.028, 0.026, 0.03, 0.5, 0, 0));
  add(hCover, rbox(0.03, 0.003, 0.002, 0.001, 1), M.ledGreen, 0, 0.056, 0.0465);
  const tipGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,214,140,1)'], [0.25, 'rgba(255,190,100,0.45)'], [1, 'rgba(255,170,80,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false
  }));
  tipGlow.scale.setScalar(0.06);
  // cordolo appena deposto dietro l'ugello (brilla)
  const beadG = part(head);
  const bead = add(beadG, new THREE.CylinderGeometry(0.0017, 0.0017, 1, 8), M.bead, 0, -0.0012, 0, 0, 0, Math.PI / 2);
  bead.userData.keep = true;

  /* ================= PIATTO (strati: PEI, base magnetica, alluminio, riscaldatore) ================= */
  const bed = part(model, 0, BED_REST, 0);
  const bedCarriage = part(bed);
  add(bedCarriage, rbox(0.62, 0.03, 0.045, 0.01), M.shell, 0, -0.045, -0.405);
  [-0.26, 0.26].forEach((x) => {
    add(bedCarriage, rbox(0.03, 0.022, 0.8, 0.008), M.shell, x, -0.04, -0.02);
    add(bedCarriage, rbox(0.036, 0.06, 0.036, 0.01), M.alu, x, -0.045, -0.405);
  });
  add(bedCarriage, rbox(0.04, 0.04, 0.036, 0.01), M.brass, 0, -0.045, -0.405);
  // riscaldatore in silicone con la serpentina
  const heater = part(bed);
  add(heater, rbox(0.62, 0.0024, 0.62, 0.001, 1), M.black, 0, -0.0186, 0);
  {
    const n = 13, span = 0.54, step = span / (n - 1);
    for (let i = 0; i < n; i++) {
      add(heater, new THREE.BoxGeometry(0.5, 0.0006, 0.007), M.gold, 0, -0.0171, -span / 2 + i * step);
      if (i < n - 1) add(heater, new THREE.BoxGeometry(0.007, 0.0006, step + 0.007), M.gold, (i % 2 ? -1 : 1) * 0.2465, -0.0171, -span / 2 + (i + 0.5) * step);
    }
    add(heater, roundCyl(0.018, 0.003, 0.001, 20), M.white, 0.2, -0.0165, 0.29);
    add(heater, wire([[0.05, -0.018, 0.31], [0.05, -0.024, 0.34], [0.04, -0.03, 0.38]], 0.002), M.black);
    add(heater, wire([[0.07, -0.018, 0.31], [0.07, -0.024, 0.34], [0.08, -0.03, 0.38]], 0.002), M.black);
  }
  // piastra in alluminio con le viti di fissaggio
  const plate = part(bed);
  add(plate, rbox(0.76, 0.012, 0.76, 0.005, 2), M.alu, 0, -0.0112, 0);
  [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]].forEach(([a, b]) => add(plate, roundCyl(0.007, 0.0014, 0.0005, 14), M.aluBright, a * 0.35, -0.0048, b * 0.35));
  // base magnetica
  const magnet = part(bed);
  add(magnet, rbox(0.752, 0.0018, 0.752, 0.0008, 1), M.magnet, 0, -0.0041, 0);
  // foglio in acciaio con PEI (il pezzo nasce qui)
  const sheet = part(bed);
  add(sheet, rbox(0.752, 0.0028, 0.752, 0.0012, 1), M.gold, 0, -0.0018, 0);
  add(sheet, new THREE.BoxGeometry(0.738, 0.0008, 0.738), M.pei, 0, -0.0003, 0);
  add(sheet, rbox(0.08, 0.0028, 0.03, 0.0012, 1), M.gold, 0, -0.0018, 0.39);

  /* ================= ELETTRONICA + SCHERMO ================= */
  const fascia = part(model, 0, (FOOT + BASE_TOP) / 2 + 0.002, D / 2 + 0.012);
  add(fascia, rbox(0.92, 0.1, 0.012, 0.01, 3), M.shellSoft);
  const scrCanvas = document.createElement('canvas');
  scrCanvas.width = 512; scrCanvas.height = 192;
  const sg = scrCanvas.getContext('2d');
  const scrTex = new THREE.CanvasTexture(scrCanvas);
  scrTex.colorSpace = THREE.SRGBColorSpace;
  scrTex.anisotropy = 8;
  let scrKey = -1;
  const drawScreen = (state, prog) => {
    const k = state * 1000 + Math.round(prog * 100);
    if (k === scrKey) return;
    scrKey = k;
    sg.fillStyle = '#050506'; sg.fillRect(0, 0, 512, 192);
    drawTriskele(sg, 62, 70, 30, '#eceef1', '#050506');
    sg.fillStyle = '#f5f5f7';
    sg.font = '600 38px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    sg.fillText('Tillverka', 112, 84);
    sg.font = '500 22px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    sg.fillStyle = '#a1a1a6';
    const label = state === 1 ? `In stampa · ${Math.round(prog * 100)}%` : state === 2 ? 'Completata' : 'Pronta';
    sg.fillText(label, 112, 118);
    sg.fillStyle = state === 1 ? '#d9b36a' : '#9fb46a';
    sg.beginPath(); sg.arc(470, 70, 7, 0, Math.PI * 2); sg.fill();
    sg.fillStyle = '#26272b';
    sg.beginPath(); sg.roundRect(40, 146, 432, 10, 5); sg.fill();
    if (prog > 0) {
      const gr = sg.createLinearGradient(40, 0, 472, 0);
      gr.addColorStop(0, '#a87d3a'); gr.addColorStop(1, '#ecd08f');
      sg.fillStyle = gr;
      sg.beginPath(); sg.roundRect(40, 146, Math.max(10, 432 * prog), 10, 5); sg.fill();
    }
    scrTex.needsUpdate = true;
  };
  drawScreen(0, 0);
  const screen = group(fascia, -0.3, 0, 0.008);
  add(screen, rbox(0.19, 0.074, 0.006, 0.008, 3), M.black);
  add(screen, new THREE.PlaneGeometry(0.176, 0.066), flat(scrTex, { depthWrite: true }), 0, 0, 0.0031).userData.keep = true;
  // triscele sul frontale (argento)
  {
    const { face, channel } = pieceShapes(THREE);
    const tri = group(fascia, 0.36, 0.002, 0.007);
    const tf = new THREE.ExtrudeGeometry(face, { depth: 0.12, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
    const tc = new THREE.ExtrudeGeometry(channel, { depth: 0.06, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 });
    tc.translate(0, 0, 0.09);
    for (let k = 0; k < 3; k++) {
      const pg = group(tri); pg.rotation.z = pieceAngle(k);
      add(pg, tf, M.aluBright); add(pg, tc, M.black);
    }
    tri.scale.setScalar(0.03);
  }
  add(fascia, roundCyl(0.009, 0.006, 0.002, 20), M.aluBright, 0.42, 0, 0.007, Math.PI / 2);   // tasto
  // scheda madre: un cassetto dietro al frontale (esce in avanti)
  const board = part(fascia, 0.02, -0.02, -0.19);
  add(board, rbox(0.5, 0.005, 0.34, 0.002, 2), M.pcb);
  add(board, rbox(0.52, 0.012, 0.012, 0.004, 2), M.shellSoft, 0, 0.004, -0.172);
  {
    const chips = [[-0.1, 0.06, 0.07, 0.07], [0.05, -0.08, 0.05, 0.04], [0.13, 0.08, 0.04, 0.05], [-0.16, -0.09, 0.06, 0.03]];
    chips.forEach(([x, z, w, d]) => add(board, rbox(w, 0.008, d, 0.002, 2), M.black, x, 0.0065, z));
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.003, 0.035, 0.11), M.aluBright, 12);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) { m4.makeTranslation(0.05 + i * 0.008, 0.021, 0.04); fins.setMatrixAt(i, m4); }
    board.add(fins);
    add(board, rbox(0.1, 0.004, 0.11, 0.002, 2), M.aluBright, 0.094, 0.0045, 0.04);
    for (let i = 0; i < 5; i++) add(board, roundCyl(0.008, 0.02, 0.002, 16), M.aluBright, -0.21 + i * 0.022, 0.012, 0.13);
    for (let i = 0; i < 6; i++) add(board, rbox(0.024, 0.012, 0.012, 0.002, 2), M.white, -0.2 + i * 0.045, 0.008, -0.15);
    add(board, rbox(0.14, 0.002, 0.01, 0.001, 1), M.gold, 0.12, 0.0035, -0.12);
  }

  /* ================= TUBI PTFE ================= */
  const feed = [0, 1, 2, 3].map(() => makeTube(M.ptfe, 0.0055, small ? 24 : 40, 8));
  feed.forEach((f) => model.add(f.mesh));
  const toHead = makeTube(M.ptfe, 0.0065, small ? 40 : 64, 10);
  model.add(toHead.mesh);

  /* ---------- fusione delle geometrie statiche (per pezzo animato) ---------- */
  {
    const roots = [];
    scene.traverse((o) => { if (o.userData.anim) roots.push(o); });
    roots.forEach(bake);
  }
  // aggiunti dopo il bake: bagliore della punta
  hNozzle.add(tipGlow);

  /* ---------- punti per l'inquadratura automatica (angoli dei gruppi, nel loro spazio) ---------- */
  model.updateMatrixWorld(true);
  const fit = [];
  {
    const box = new THREE.Box3(), inv = new THREE.Matrix4();
    const fitBox = (obj) => {
      box.setFromObject(obj);
      inv.copy(obj.matrixWorld).invert();
      for (let i = 0; i < 8; i++) {
        fit.push([obj, V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv)]);
      }
    };
    [frame, left, right, back, door, lid, spools, uLid, gantry, hBack, hSink, hHeater, hNozzle, hFan, hGrille, hCover,
      sheet, magnet, plate, heater, bedCarriage, fascia, board, ...caps].forEach(fitBox);
    spoolObjs.forEach((s) => fitBox(s.g));
    for (let i = 0; i < 16; i++) {           // bordo del piedistallo
      const an = (i / 16) * Math.PI * 2;
      fit.push([floor, V(Math.cos(an) * PED_R, 0, Math.sin(an) * PED_R)]);
    }
  }

  /* ---------- il pezzo stampato: medaglione col logo, in piedi su una basetta ----------
     multimateriale: disco nero, facce del triscele in argento (con il filo attorno ai canali), canali neri in rilievo */
  const PRINT_X = 0.0, PRINT_Z = 0.02, PRINT_ROT = 0.42;
  const printG = group(sheet, PRINT_X, 0, PRINT_Z);
  printG.rotation.y = PRINT_ROT;
  const DISC_R = 1.0;
  const silverParts = [], blackParts = [];
  {
    const { face, channel } = pieceShapes(THREE);
    const disc = new THREE.Shape();
    disc.absarc(0, 0, DISC_R, 0, Math.PI * 2, false);
    const dg = new THREE.ExtrudeGeometry(disc, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: small ? 48 : 96 });
    dg.translate(0, 0, -0.11);
    blackParts.push(dg);
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Matrix4().makeRotationZ(pieceAngle(k));
      const f = new THREE.ExtrudeGeometry(face, { depth: 0.14, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
      f.translate(0, 0, -0.02); f.applyMatrix4(r); silverParts.push(f);
      const rimG = new THREE.ExtrudeGeometry(channel, { depth: 0.14, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.012, bevelSegments: 2 });
      rimG.translate(0, 0, -0.02); rimG.applyMatrix4(r); silverParts.push(rimG);
      const c = new THREE.ExtrudeGeometry(channel, { depth: 0.05, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.006, bevelSegments: 2 });
      c.translate(0, 0, 0.13); c.applyMatrix4(r); blackParts.push(c);
    }
  }
  const medSilver = mergeGeometries(silverParts), medBlackDisc = blackParts[0], medChan = mergeGeometries(blackParts.slice(1));
  silverParts.forEach((g) => g.dispose());
  blackParts.slice(1).forEach((g) => g.dispose());
  const MED_H = 2 * (DISC_R + 0.03);
  const ls = LOGO_H / MED_H;
  const discCY = PLINTH_H - 0.005 + (DISC_R + 0.03) * ls;
  const toPrint = new THREE.Matrix4().makeScale(ls, ls, ls).premultiply(new THREE.Matrix4().makeTranslation(0, discCY, -0.05 * ls));
  [medSilver, medBlackDisc, medChan].forEach((g) => g.applyMatrix4(toPrint));
  const plinthW = 1.25 * DISC_R * ls;
  const plinthGeo = rbox(plinthW, PLINTH_H, 0.1, 0.007, 3);
  plinthGeo.translate(0, PLINTH_H / 2, 0);
  /* UV planari: v = quota → le righe degli strati sono sempre orizzontali */
  [medSilver, medBlackDisc, medChan, plinthGeo].forEach((g) => {
    const p = g.attributes.position, uvA = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uvA[i * 2] = p.getX(i) * 4 + p.getZ(i) * 4; uvA[i * 2 + 1] = p.getY(i) / (LAYER * 128); }
    g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  });
  const layersTex = layerLinesTexture(128);
  const cutTop = new THREE.Plane(V(0, -1, 0), 0);     // tiene y <= taglio
  const cutMain = new THREE.Plane(V(0, -1, 0), 0);    // tiene y <= taglio - strato caldo
  const cutLow = new THREE.Plane(V(0, 1, 0), 0);      // tiene y >= taglio - strato caldo
  const printSilver = mat.satinSilver({ color: 0xe4e7ec, roughness: 0.26, clearcoat: 0.1, clearcoatRoughness: 0.3, bumpMap: layersTex, bumpScale: 0.8, clippingPlanes: [cutMain] });
  const printBlack = phys({ color: 0x17181b, roughness: 0.5, clearcoat: 0.15, bumpMap: layersTex, bumpScale: 0.8, clippingPlanes: [cutMain] });
  const printGloss = phys({ color: 0x0d0d0f, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15, bumpMap: layersTex, bumpScale: 0.5, clippingPlanes: [cutMain] });
  const hotBand = mat.glow(0xf6c46e, { clippingPlanes: [cutTop, cutLow] });
  const hotCap = mat.glow(COLORS.glow, { side: THREE.BackSide, clippingPlanes: [cutTop] });
  const printMeshes = [];
  [[medSilver, printSilver], [medBlackDisc, printBlack], [medChan, printGloss], [plinthGeo, printBlack]].forEach(([g, m]) => {
    printMeshes.push(add(printG, g, m), add(printG, g, hotBand), add(printG, g, hotCap));
  });
  /* larghezza della sezione del pezzo alla quota y (per il percorso della testina) */
  const xRange = [];
  for (let i = 0, N = 120; i <= N; i++) {
    const y = (i / N) * PRINT_H;
    if (y <= PLINTH_H) { xRange.push([-plinthW * 0.46, plinthW * 0.46]); continue; }
    const dy = (y - discCY) / ls, r = DISC_R * 0.96;
    const hw = Math.sqrt(Math.max(0, r * r - dy * dy)) * ls;
    xRange.push([-hw, hw]);
  }

  /* ---------- etichette: punto d'ancoraggio di ogni pezzo ---------- */
  const callouts = [...(ctx.overlay?.querySelectorAll('.callout[data-part]') || [])];
  const anchors = {
    enclosure: [right, V(0, 0.28, -0.22)],
    spools: [spoolObjs[3].g, V(0.08, 0.1, 0.02)],
    gantry: [gantry, V(0.412, RAIL_Y, -0.2)],
    toolhead: [hNozzle, V(0, 0.004, 0)],
    bed: [sheet, V(-0.3, 0, 0.34)],
    frame: [caps[2], V(0, 0.012, 0)]
  };

  /* ---------- camera ---------- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tgt = V(), camDir = V(), wv = V(), bmin = V(), bmax = V();
  const wFit = fit.map(() => V());
  const view = { t: V(), d: 1 };
  /* inquadratura: centro e distanza perché tutti i punti stiano nella finestra disponibile
     (kV, kH = 1 / semi-apertura utile in verticale e in orizzontale) */
  const fitView = (pts, el, kV, kH, out) => {
    const ce = Math.cos(el), se = Math.sin(el);
    bmin.set(1e9, 1e9, 1e9); bmax.set(-1e9, -1e9, -1e9);
    for (let i = 0; i < pts.length; i++) { bmin.min(pts[i]); bmax.max(pts[i]); }
    out.t.addVectors(bmin, bmax).multiplyScalar(0.5);
    let d = 0;
    for (let pass = 0; pass < 3; pass++) {
      d = 0;
      for (let i = 0; i < pts.length; i++) {
        wv.subVectors(pts[i], out.t);
        const xc = wv.x, yc = wv.y * ce - wv.z * se, zc = wv.y * se + wv.z * ce;
        d = Math.max(d, zc + Math.abs(yc) * kV, zc + Math.abs(xc) * kH);
      }
      if (pass === 2) break;
      // centra l'ingombro proiettato
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
  const a = V(), b = V(), da = V(), db = V(), hubIn = V();
  const HUB_OUT = V(0, 0, 0.025), HEAD_IN = V(0, 0.172, 0);
  const COOL = new THREE.Color(0xd9dde2), BAND = new THREE.Color(0xf6c46e), CAP = new THREE.Color(COLORS.glow);
  const toModel = (obj, local, out) => model.worldToLocal(out.copy(local).applyMatrix4(obj.matrixWorld));

  const PARK = V(-0.12, 0, 0.12);
  const EXP_HEAD = V(0.02, 1.18, 0.64);
  const hp = V(), hs = V(), hr = V();
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), s1 = V(1, 1, 1), sp = V();
  const capPos = CORNERS.map(([sx, sz]) => V(sx * PX, 0, sz * PZ));
  const pcr = Math.cos(PRINT_ROT), psr = Math.sin(PRINT_ROT);

  return {
    scene,
    camera,
    update(state) {
      const { p, t, pointer, w, h, aspect } = state;
      const idle = ctx.reduceMotion ? 0 : 1;
      const desk = smoothstep((aspect - 0.85) / 0.2);
      const spread = lerp(0.72, 1, desk);

      /* ---------- esplosione (0.12–0.50) e ricomposizione (0.50–0.64), a cascata ---------- */
      const eLid = outIn(p, 0.12, 0.2, 0.575, 0.635);
      const eDoor = outIn(p, 0.13, 0.21, 0.57, 0.63);
      const eSide = outIn(p, 0.14, 0.22, 0.565, 0.63);
      const eBack = outIn(p, 0.15, 0.22, 0.565, 0.63);
      const eUnit = outIn(p, 0.17, 0.26, 0.55, 0.62);
      const eULid = outIn(p, 0.2, 0.25, 0.545, 0.595);
      const eGantry = outIn(p, 0.24, 0.33, 0.53, 0.6);
      const eHead = outIn(p, 0.26, 0.34, 0.525, 0.595);
      const eHeadX = outIn(p, 0.31, 0.39, 0.505, 0.56);
      const eBed = outIn(p, 0.3, 0.37, 0.52, 0.59);
      const eBedX = outIn(p, 0.33, 0.41, 0.505, 0.565);
      const eElec = outIn(p, 0.34, 0.42, 0.51, 0.575);
      const eBoard = outIn(p, 0.37, 0.44, 0.5, 0.55);
      const eCaps = outIn(p, 0.38, 0.45, 0.5, 0.55);

      // involucro: ogni pannello vola via lungo la sua normale
      lid.position.y = TOP + 0.0075 + eLid * 0.52;
      lid.rotation.x = eLid * 0.03;
      door.position.z = D / 2 + 0.005 + eDoor * 0.62 * spread;
      door.rotation.y = eDoor * 0.05;
      left.position.x = -W / 2 - 0.005 - eSide * 0.5 * spread;
      right.position.x = W / 2 + 0.005 + eSide * 0.5 * spread;
      left.rotation.z = eSide * 0.03; right.rotation.z = -eSide * 0.03;
      back.position.z = -D / 2 - 0.006 - eBack * 0.5;

      // unità bobine: sale col coperchio, poi si stacca; il suo coperchio si apre e le bobine escono una a una
      spools.position.y = TOP + 0.013 + eLid * 0.52 + eUnit * 0.32;
      uLid.rotation.x = -1.05 * eULid;
      uLid.position.y = UB - 0.004 + eULid * 0.02;
      for (let i = 0; i < 4; i++) {
        const s = spoolObjs[i];
        const e = outIn(p, 0.215 + i * 0.016, 0.285 + i * 0.016, 0.535 + (3 - i) * 0.007, 0.58 + (3 - i) * 0.007);
        const lift = sub(e, 0, 0.45), slide = sub(e, 0.25, 1);
        s.g.position.set(s.x * (1 + 0.1 * e * spread), UB + 0.02 + lift * 0.12, slide * 0.44);
        s.g.rotation.y = e * 0.06 * (i - 1.5);
        s.spin.rotation.x = slide * 0.44 / 0.172 + p * 2 * (i % 2 ? -1 : 1);
      }

      gantry.position.y = eGantry * 0.26;

      /* ---------- stampa (0.60–1.00) ---------- */
      const home = easeInOutCubic(seg(p, 0.6, 0.68));
      const prog = seg(p, 0.68, 0.95);
      const done = easeInOutCubic(seg(p, 0.955, 1));
      const hh = PRINT_H * prog;
      const active = seg(p, 0.675, 0.69) * (1 - seg(p, 0.945, 0.96));
      // percorso della testina: va e viene sulla sezione dello strato corrente
      const row = xRange[Math.min(xRange.length - 1, Math.round(prog * (xRange.length - 1)))];
      const ph = prog * 38 + (idle ? t * 0.9 : 0) * active;
      const fr = ((ph % 2) + 2) % 2;
      const tri = 1 - Math.abs(fr - 1);
      const dir = fr < 1 ? 1 : -1;                 // verso di marcia lungo la riga
      {
        const lx = lerp(row[0], row[1], tri), lz = Math.sin(ph * 2.3) * 0.016;
        hp.set(PRINT_X + lx * pcr + lz * psr, 0, PRINT_Z - lx * psr + lz * pcr);
      }
      const toStart = easeInOutCubic(seg(p, 0.61, 0.68));
      hs.set(lerp(PARK.x, PRINT_X + xRange[0][0] * pcr, toStart), 0, lerp(PARK.z, PRINT_Z - xRange[0][0] * psr, toStart));
      if (prog > 0) hs.lerp(hp, seg(p, 0.68, 0.7));
      hs.lerp(PARK, done);
      const headX = hs.x, headZ = hs.z;

      const bedTop = lerp(BED_REST, NZ - 0.0025, home) - hh - done * 0.07;
      // piatto: scende e si apre in strati
      bed.position.set(0, bedTop - eBed * 0.24, 0);
      sheet.position.y = eBedX * 0.39;
      magnet.position.y = eBedX * 0.26;
      plate.position.y = eBedX * 0.13;
      sheet.rotation.x = -eBedX * 0.025;

      beam.position.z = headZ - 0.055;
      carriage.position.x = headX;
      // testina: lascia il carrello, avanza, si ingrandisce (dettaglio) e si apre nei suoi pezzi
      hr.set(headX, NZ + gantry.position.y, headZ).lerp(EXP_HEAD, eHead);
      head.position.copy(hr);
      head.scale.setScalar(1 + 1.05 * eHead);
      head.rotation.y = -0.42 * eHead;
      hCover.position.set(0, 0.012 * sub(eHeadX, 0, 0.55), 0.15 * sub(eHeadX, 0, 0.55));
      hGrille.position.z = 0.105 * sub(eHeadX, 0.08, 0.63);
      hFan.position.z = 0.062 * sub(eHeadX, 0.16, 0.71);
      hBack.position.z = -0.045 * sub(eHeadX, 0.2, 0.75);
      hHeater.position.y = -0.045 * sub(eHeadX, 0.3, 0.85);
      hNozzle.position.y = -0.085 * sub(eHeadX, 0.4, 1);
      rotor.rotation.z = p * 60 + (idle ? t * 5 : 0);

      // elettronica: il frontale avanza, la scheda esce dal cassetto
      fascia.position.z = D / 2 + 0.012 + eElec * 0.42 * spread;
      fascia.position.y = (FOOT + BASE_TOP) / 2 + 0.002 - eElec * 0.01;
      board.position.z = -0.19 + eBoard * 0.3;

      // angoli del telaio: i tappi si alzano, le viti escono a metà
      for (let i = 0; i < 4; i++) {
        caps[i].position.y = TOP + 0.004 + eCaps * 0.13;
        const y = TOP + 0.003 + eCaps * 0.07;
        sp.set(capPos[i].x, y, capPos[i].z);
        m4.compose(sp, q0, s1); capScrew.head.setMatrixAt(i, m4);
        sp.y = y + 0.0027; m4.compose(sp, q0, s1); capScrew.sock.setMatrixAt(i, m4);
        sp.y = y - 0.031; m4.compose(sp, q0, s1); capScrew.shank.setMatrixAt(i, m4);
      }
      capScrew.head.instanceMatrix.needsUpdate = capScrew.sock.instanceMatrix.needsUpdate = capScrew.shank.instanceMatrix.needsUpdate = true;

      /* taglio di stampa: il pezzo cresce fino alla punta dell'ugello */
      const printing = p > 0.675 && eBed < 0.001;
      const cutY = NZ - 0.0025;
      const band = 0.005;
      const cool = seg(p, 0.955, 0.99);
      const finished = cool >= 1;
      cutTop.constant = !printing ? -50 : finished ? 10 : cutY;
      cutMain.constant = !printing ? -50 : finished ? 10 : cutY - band * (1 - cool);
      cutLow.constant = -(cutY - band);
      hotBand.color.copy(BAND).lerp(COOL, cool);
      hotCap.color.copy(CAP).lerp(COOL, cool);
      for (let i = 0; i < printMeshes.length; i++) if (i % 3) printMeshes[i].visible = !finished;
      const heat = active * (prog > 0 ? 1 : 0);
      tip.visible = tipGlow.visible = heat > 0.02;
      tipGlow.material.opacity = heat * (0.85 + (idle ? 0.15 * Math.sin(t * 9) : 0));
      // cordolo caldo: dietro l'ugello, nel verso della riga, corto vicino alle inversioni
      const trail = 0.045 * Math.min(1, (dir > 0 ? tri : 1 - tri) * (row[1] - row[0]) / 0.045);
      bead.visible = heat > 0.02 && trail > 0.002;
      beadG.rotation.y = PRINT_ROT;
      bead.scale.set(1, Math.max(0.001, trail), 1);
      bead.position.x = -dir * trail / 2;

      drawScreen(prog >= 1 ? 2 : prog > 0 ? 1 : 0, prog);
      const inPrint = easeInOutCubic(seg(p, 0.62, 0.74));
      M.glassDoor.opacity = lerp(0.34, 0.1, inPrint);
      streakMat.opacity = lerp(0.3, 0.12, inPrint);

      /* ---------- rotazione ---------- */
      const rot = track(p, ROT_KEYS);
      model.rotation.y = rot + (idle ? Math.sin(t * 0.35) * 0.035 + pointer.x * 0.06 : 0) * (1 - 0.6 * inPrint);
      floor.rotation.y = model.rotation.y;
      scene.updateMatrixWorld(true);

      /* ---------- camera: inquadra tutti i pezzi (sempre interi), dolly leggero nella stampa ---------- */
      const el = track(p, EL_KEYS) + (idle ? pointer.y * 0.02 : 0);
      const offX = lerp(0, 0.245, desk), offY = lerp(0.14, 0, desk);   // desktop: centro al 74% (il testo finisce a ~47%)
      camera.setViewOffset(w, h, -offX * w, offY * h, w, h);
      const k = track(p, FIT_KEYS);
      const availH = lerp(0.9, 0.45, desk) * k, availV = lerp(0.54, 0.8, desk) * k;   // mobile: sotto la barra in alto, sopra il testo
      const kV = 1 / (tanHalf * availV), kH = 1 / (tanHalf * aspect * availH);
      for (let i = 0; i < fit.length; i++) wFit[i].copy(fit[i][1]).applyMatrix4(fit[i][0].matrixWorld);
      fitView(wFit, el, kV, kH, view);
      tgt.copy(view.t);
      camDir.set(0, Math.sin(el), Math.cos(el));
      camera.position.copy(tgt).addScaledVector(camDir, view.d);
      camera.lookAt(tgt);
      camera.updateMatrixWorld();

      /* ---------- tubi PTFE (seguono i pezzi) ---------- */
      for (let i = 0; i < 4; i++) {
        toModel(spools, portPos[i], a);
        hubIn.set(-0.036 + i * 0.024, 0.03, 0);
        toModel(hub, hubIn, b);
        da.set(0, 0, -0.1);
        db.set(0, 0.12 + eUnit * 0.3, 0);
        feed[i].set(a, da, b, db);
      }
      toModel(hub, HUB_OUT, a);
      toModel(hSink, HEAD_IN, b);
      da.set(0, 0, 0.3);
      db.set(0, 0.16 + eHead * 0.2, 0);
      toHead.set(a, da, b, db);

      /* ---------- etichette: posizione a schermo del punto di ancoraggio ---------- */
      if (callouts.length) {
        const cx = ctx.project(tgt).x;
        const textEdge = Math.max(8, 0.47 * w * desk);   // desktop: il testo occupa la sinistra
        const lw = lerp(120, 250, desk);                 // ingombro stimato dell'etichetta + filo
        for (let i = 0; i < callouts.length; i++) {
          const c = callouts[i], an = anchors[c.dataset.part];
          if (!an) continue;
          wv.copy(an[1]).applyMatrix4(an[0].matrixWorld);
          const s = ctx.project(wv);
          c.style.setProperty('--x', s.x.toFixed(1) + 'px');
          c.style.setProperty('--y', s.y.toFixed(1) + 'px');
          let side = s.x < cx ? 'left' : 'right';
          if (side === 'left' && s.x - lw < textEdge) side = 'right';
          if (side === 'right' && s.x + lw > w - 8 && s.x - lw >= textEdge) side = 'left';
          c.dataset.side = side;
        }
      }
    },
    resize() {},
    dispose() {
      // le texture sui materiali le libera il core; qui niente di extra
      ctx.renderer.localClippingEnabled = false;
    }
  };
}
