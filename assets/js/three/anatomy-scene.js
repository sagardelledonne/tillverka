/* Tillverka · scena "anatomy" (#anatomia, sfondo nero): anatomia di un pezzo stampato in PLA argento.
   Una staffa a L spessa (due fori alle estremità, foro grande nell'angolo, raggio interno) con un'aletta a sbalzo
   nella metà alta: è l'aletta che ha bisogno dei supporti ad albero.
   p 0.00–0.12  pezzo intero, gira lento, luce radente sugli strati
   p 0.12–0.30  un piano di taglio lo apre a metà: pareti concentriche e riempimento
   p 0.30–0.62  esplosione verticale: superficie (4 strati a 45°), pareti, riempimento gyroid, fondo, supporti, brim
   p 0.62–0.80  a pezzo aperto il riempimento si ristampa dal basso: griglia → nido d'ape → gyroid
   p 0.80–1.00  si richiude, bagliore oro che si spegne (si raffredda)
   Pose = funzioni pure di p (+ piccolo moto idle con t e puntatore, spento con reduceMotion). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seg, smoothstep, easeInOutCubic, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture } from './materials.js';
import {
  TAU, V, add, group, flat, fillet, roundCyl, offsetPoly, openPoly, circlePts, stripes, taperTube,
  fitOf, boxPts, makeFramer, placeCallouts
} from './kit.js';

/* ---------- tempi ---------- */
const T = {
  cutA: 0.125, cutB: 0.235, uncutA: 0.282, uncutB: 0.338,
  skin: [0.305, 0.4], walls: [0.335, 0.43], infill: [0.365, 0.455], sup: [0.405, 0.495], layers: [0.43, 0.52],
  growA: 0.385, growB: 0.435,
  backA: 0.592, backB: 0.652,
  pat: [[0.612, 0.648], [0.668, 0.702], [0.726, 0.762]],
  closeA: 0.8, closeB: 0.872, heatA: 0.855, heatP: 0.878, coolB: 0.99
};

/* ---------- misure (1 unità ≈ 20 mm) ---------- */
const H = 0.44, H1 = 0.26, S = 0.06, W = 0.028, GAP = 0.0035, NW = 3;
const LAYER = H / 30;                         // altezza di strato visibile sui fianchi
const LINE = 0.022;                           // passo delle righe di riempimento pieno sulla superficie
/* pianta: (x, z) e raggio di raccordo; B = A + aletta a sbalzo (solo nella metà alta) */
const A_PTS = [[-0.9, -0.55, 0.3], [1.05, -0.55, 0.31], [1.05, 0.07, 0.31], [-0.28, 0.07, 0.26], [-0.28, 0.95, 0.31], [-0.9, 0.95, 0.3]];
const B_PTS = [[-0.9, -0.55, 0.3], [1.05, -0.55, 0.31], [1.05, 0.07, 0.31], [0.67, 0.07, 0.07], [0.67, 0.58, 0.2], [0.12, 0.58, 0.2],
  [0.12, 0.07, 0.07], [-0.28, 0.07, 0.26], [-0.28, 0.95, 0.31], [-0.9, 0.95, 0.3]];
const EAR_PTS = [[0.67, 0.07, 0], [0.67, 0.58, 0.2], [0.12, 0.58, 0.2], [0.12, 0.07, 0]];
const HOLES_A = [[0.74, -0.24, 0.1], [-0.59, 0.64, 0.1], [-0.59, -0.24, 0.13]];
const HOLE_EAR = [0.395, 0.31, 0.075];
const BOX = { x0: -0.95, x1: 1.1, z0: -0.6, z1: 1.0 };   // area delle maschere del riempimento

const plan = (pts) => openPoly(fillet(pts.map(([x, z, r]) => [x, z, r]), 0.01, 10, 0.98));
const toShape = (pts) => pts.map((p) => new THREE.Vector2(p.x, -p.y));   // pianta (x, z) → forma (x, -z)

/* ======================================================================= */
export async function create(ctx) {
  const small = ctx.small;
  ctx.renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  /* luci: luce radente che gira (esalta gli strati), controluce fredda, riempimento tenue */
  scene.add(new THREE.HemisphereLight(0xdfe4ee, 0x1a1a1e, 0.35));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdce6ff, 1.5);
  rim.position.set(-3.2, 2.2, -3.4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(2, 3, 4);
  scene.add(fill);

  /* ---------- materiali ---------- */
  const layerTex = stripes(16, '#5c5c5c', '#ffffff');
  const cutPlane = new THREE.Plane(V(-1, 0, 0), 100);   // nello spazio del pezzo
  const cutW = [new THREE.Plane()];
  const plaOpts = {
    color: 0xd6d9df, metalness: 0.8, roughness: 0.29, bumpMap: layerTex, bumpScale: 0.9,
    clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 1.2,
    emissive: new THREE.Color(0xffb85a), emissiveIntensity: 0, clippingPlanes: cutW
  };
  const pla = new THREE.MeshPhysicalMaterial(plaOpts);
  const topMat = new THREE.MeshPhysicalMaterial({ ...plaOpts, transparent: true, emissive: new THREE.Color(0xffb44a) });
  const ironMat = new THREE.MeshPhysicalMaterial({ ...plaOpts, bumpScale: 0.25, roughness: 0.26, transparent: true, emissive: new THREE.Color(0xffb44a) });
  const capMat = new THREE.MeshBasicMaterial({ color: 0xc9ccd2, side: THREE.BackSide, clippingPlanes: cutW });
  const supMat = mat.bambooGreen({ roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, bumpMap: layerTex, bumpScale: 0.5, transparent: true });
  const brimMat = new THREE.MeshPhysicalMaterial({ ...plaOpts, clippingPlanes: [], transparent: true });

  /* uv: fianchi → righe orizzontali (strati); facce in piano → righe a 45° (riempimento pieno) */
  const layerUV = (geo, ang = Math.PI / 4) => {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(n.getY(i)) > 0.7) { uv[i * 2] = (x * -s + z * c) * 3; uv[i * 2 + 1] = (x * c + z * s) / (16 * LINE); }
      else { uv[i * 2] = (x + z) * 3; uv[i * 2 + 1] = y / (16 * LAYER); }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  };
  /* prisma in pianta (contorno + fori), da y0 a y1, spigoli smussati senza cambiare le misure */
  const prism = (outer, holes, y0, y1, bev = 0.003, ang) => {
    const sh = new THREE.Shape(toShape(offsetPoly(outer, bev)));
    holes.forEach((h) => sh.holes.push(new THREE.Path(toShape(offsetPoly(h, -bev)))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.0005, y1 - y0 - 2 * bev), bevelEnabled: true, bevelSize: bev, bevelThickness: bev, bevelSegments: 2, curveSegments: 12 });
    g.translate(0, 0, y0 + bev);
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    return layerUV(g, ang);
  };
  const hole = (h, r = h[2]) => circlePts(h[0], h[1], r, 56);

  /* ---------- contorni ---------- */
  const A = plan(A_PTS), B = plan(B_PTS), EAR = plan(EAR_PTS);
  const holesA = HOLES_A.map((h) => hole(h)), holeEar = hole(HOLE_EAR);

  const root = group(scene);                       // posa: imbardata
  const part = group(root, -0.075, 0, -0.2);      // centro della pianta sull'asse di rotazione
  const addCut = (parent, geo, m = pla) => {
    add(parent, geo, capMat);
    return add(parent, geo, m);
  };

  /* fondo: strati pieni appoggiati al piatto */
  const bottomG = group(part);
  addCut(bottomG, prism(A, holesA, 0, S, 0.004, -Math.PI / 4));

  /* pareti: tre perimetri concentrici (A sotto, B sopra) + perimetri dei fori + fondo dell'aletta */
  const wallsG = group(part);
  const ringG = [];
  for (let i = 0; i < NW; i++) {
    const g = group(wallsG);
    const o0 = i * W, o1 = (i + 1) * W - GAP;
    const parts = [
      prism(offsetPoly(A, o0), [offsetPoly(A, o1)], S, H1, 0.002),
      prism(offsetPoly(B, o0), [offsetPoly(B, o1)], H1, H - S, 0.002)
    ];
    HOLES_A.forEach(([x, z, r]) => {
      const rg = roundCyl(r + o1 + GAP * 0.5, H - 2 * S, 0.002, 56, r + o0 + GAP * 0.5);
      rg.translate(x, H / 2, z);
      parts.push(layerUV(flat(rg).deleteAttribute('uv')));
    });
    {
      const [x, z, r] = HOLE_EAR;
      const rg = roundCyl(r + o1 + GAP * 0.5, H - S - (H1 + S), 0.002, 48, r + o0 + GAP * 0.5);
      rg.translate(x, (H1 + S + H - S) / 2, z);
      parts.push(layerUV(flat(rg).deleteAttribute('uv')));
    }
    addCut(g, mergeGeometries(parts.map(flat)));
    ringG.push(g);
  }
  addCut(wallsG, prism(EAR, [holeEar], H1, H1 + S, 0.003, Math.PI / 4));   // fondo dell'aletta (sbalzo)

  /* superficie: 4 strati pieni con righe alternate a ±45°, l'ultimo "stirato" (liscio) */
  const topG = group(part);
  const topLayers = [];
  for (let i = 0; i < 4; i++) {
    const y0 = H - S + i * (S / 4);
    const g = group(topG);
    addCut(g, prism(B, [...holesA, holeEar], y0, y0 + S / 4, i === 3 ? 0.004 : 0.0022, i % 2 ? Math.PI / 4 : -Math.PI / 4), i === 3 ? ironMat : topMat);
    topLayers.push(g);
  }

  /* ---------- riempimento: maschere in pianta (dentro l'ultimo perimetro, fuori dai fori) ---------- */
  const MW = 1024, MH = Math.round(MW * (BOX.z1 - BOX.z0) / (BOX.x1 - BOX.x0));
  const toPx = (x, z) => [(x - BOX.x0) / (BOX.x1 - BOX.x0) * MW, (z - BOX.z0) / (BOX.z1 - BOX.z0) * MH];
  const maskCanvas = (outline, holes, holeR) => {
    const c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, MW, MH);
    g.fillStyle = '#fff';
    g.beginPath();
    offsetPoly(outline, NW * W - GAP * 0.5).forEach((p, i) => { const [x, y] = toPx(p.x, p.y); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.fill();
    g.fillStyle = '#000';
    holes.forEach(([x, z, r]) => {
      const [px, py] = toPx(x, z);
      g.beginPath(); g.arc(px, py, (r + NW * W - GAP * 0.5) / (BOX.x1 - BOX.x0) * MW, 0, TAU); g.fill();
    });
    return c;
  };
  const cA = maskCanvas(A, HOLES_A), cB = maskCanvas(B, [...HOLES_A, HOLE_EAR]);
  const dA = cA.getContext('2d').getImageData(0, 0, MW, MH).data, dB = cB.getContext('2d').getImageData(0, 0, MW, MH).data;
  const maskTex = (c) => { const t = new THREE.CanvasTexture(c); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
  const texA = maskTex(cA), texB = maskTex(cB);
  const sampleMask = (d, x, z) => {
    const [px, py] = toPx(x, z);
    const ix = Math.min(MW - 1, Math.max(0, px | 0)), iy = Math.min(MH - 1, Math.max(0, py | 0));
    return d[(iy * MW + ix) * 4] > 127;
  };
  const inside = (x, y, z) => {
    const a = sampleMask(dA, x, z);
    if (y < H1) return a;
    return a || (y > H1 + S && sampleMask(dB, x, z));
  };

  const infillMat = (seed) => {
    const u = {
      uMaskA: { value: texA }, uMaskB: { value: texB },
      uBox: { value: new THREE.Vector4(BOX.x0, BOX.z0, 1 / (BOX.x1 - BOX.x0), 1 / (BOX.z1 - BOX.z0)) },
      uY: { value: new THREE.Vector2(-1, 9) },          // parte visibile: y tra min e max
      uFront: { value: new THREE.Vector2(-9, 0) }       // quota del fronte caldo, intensità
    };
    const m = new THREE.MeshPhysicalMaterial({
      ...plaOpts, color: 0xc9ccd2, metalness: 0.22, roughness: 0.52, bumpScale: 0.45, side: THREE.DoubleSide, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 1.0
    });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLoc;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uMaskA, uMaskB; uniform vec4 uBox; uniform vec2 uY, uFront; varying vec3 vLoc;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          vec2 muv = vec2((vLoc.x - uBox.x) * uBox.z, 1.0 - (vLoc.z - uBox.y) * uBox.w);
          float ma = texture2D(uMaskA, muv).r, mb = texture2D(uMaskB, muv).r;
          float ins = vLoc.y < ${H1.toFixed(4)} ? ma : max(ma, vLoc.y > ${(H1 + S).toFixed(4)} ? mb : 0.0);
          if (ins < 0.5 || vLoc.y < ${S.toFixed(4)} || vLoc.y > ${(H - S).toFixed(4)} || vLoc.y < uY.x || vLoc.y > uY.y) discard;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float fr = (1.0 - smoothstep(0.0, 0.035, abs(vLoc.y - uFront.x))) * uFront.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.45), fr * 0.7);
          totalEmissiveRadiance += vec3(1.0, 0.72, 0.32) * fr * 1.6;`);
    };
    m.customProgramCacheKey = () => 'tv-infill';
    m.userData.u = u;
    m.userData.seed = seed;
    return m;
  };

  /* gyroid vero: isosuperficie g = 0 estratta con "surface nets", normali dal gradiente esatto */
  const gyroidGeo = (() => {
    const P = 0.25, k = TAU / P;
    const step = small ? 0.026 : 0.0175;
    const x0 = BOX.x0 + 0.08, z0 = BOX.z0 + 0.08, y0 = S - step * 1.5;
    const nx = Math.ceil((BOX.x1 - 0.08 - x0) / step), nz = Math.ceil((BOX.z1 - 0.08 - z0) / step), ny = Math.ceil((H - S + step * 1.5 - y0) / step);
    const NX = nx + 1, NY = ny + 1, NZ = nz + 1;
    const val = new Float32Array(NX * NY * NZ);
    const g = (x, y, z) => { const X = x * k, Y = y * k, Z = z * k; return Math.sin(X) * Math.cos(Y) + Math.sin(Y) * Math.cos(Z) + Math.sin(Z) * Math.cos(X); };
    for (let kk = 0; kk < NZ; kk++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) val[i + NX * (j + NY * kk)] = g(x0 + i * step, y0 + j * step, z0 + kk * step);
    const at = (i, j, kk) => val[i + NX * (j + NY * kk)];
    const cell = new Int32Array(nx * ny * nz).fill(-1);
    const pos = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let kk = 0; kk < nz; kk++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { cv[c] = at(i + (c & 1), j + ((c >> 1) & 1), kk + ((c >> 2) & 1)); if (cv[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of E) {
        if ((cv[a] < 0) === (cv[b] < 0)) continue;
        const t = cv[a] / (cv[a] - cv[b]);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t;
        sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
        sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
        n++;
      }
      cell[i + nx * (j + ny * kk)] = pos.length / 3;
      pos.push(x0 + (i + sx / n) * step, y0 + (j + sy / n) * step, z0 + (kk + sz / n) * step);
    }
    const idx = [];
    const ci = (i, j, kk) => (i < 0 || j < 0 || kk < 0 || i >= nx || j >= ny || kk >= nz ? -1 : cell[i + nx * (j + ny * kk)]);
    const P3 = (q) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      const pa = P3(a), pc = P3(c);
      const mx = (pa[0] + pc[0]) / 2, my = (pa[1] + pc[1]) / 2, mz = (pa[2] + pc[2]) / 2;
      if (!(inside(pa[0], pa[1], pa[2]) || inside(pc[0], pc[1], pc[2]) || inside(mx, my, mz))) return;
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    };
    for (let kk = 0; kk < NZ; kk++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const v0 = at(i, j, kk), s0 = v0 < 0;
      if (i < nx && j > 0 && kk > 0 && s0 !== (at(i + 1, j, kk) < 0)) quad(ci(i, j - 1, kk - 1), ci(i, j, kk - 1), ci(i, j, kk), ci(i, j - 1, kk), s0);
      if (j < ny && i > 0 && kk > 0 && s0 !== (at(i, j + 1, kk) < 0)) quad(ci(i - 1, j, kk - 1), ci(i - 1, j, kk), ci(i, j, kk), ci(i, j, kk - 1), s0);
      if (kk < nz && i > 0 && j > 0 && s0 !== (at(i, j, kk + 1) < 0)) quad(ci(i - 1, j - 1, kk), ci(i, j - 1, kk), ci(i, j, kk), ci(i - 1, j, kk), s0);
    }
    const nor = new Float32Array(pos.length), uv = new Float32Array(pos.length / 3 * 2);
    for (let q = 0; q < pos.length / 3; q++) {
      const X = pos[q * 3] * k, Y = pos[q * 3 + 1] * k, Z = pos[q * 3 + 2] * k;
      let gx = Math.cos(X) * Math.cos(Y) - Math.sin(Z) * Math.sin(X);
      let gy = -Math.sin(X) * Math.sin(Y) + Math.cos(Y) * Math.cos(Z);
      let gz = -Math.sin(Y) * Math.sin(Z) + Math.cos(Z) * Math.cos(X);
      const l = Math.hypot(gx, gy, gz) || 1;
      nor[q * 3] = gx / l; nor[q * 3 + 1] = gy / l; nor[q * 3 + 2] = gz / l;
      uv[q * 2] = (pos[q * 3] + pos[q * 3 + 2]) * 3; uv[q * 2 + 1] = pos[q * 3 + 1] / (16 * LAYER);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    /* orienta i triangoli come il gradiente (serve alle facce doppie) */
    const ix = geo.index.array, pa = V(), pb = V(), pc = V(), cr = V(), gn = V();
    for (let t = 0; t < ix.length; t += 3) {
      pa.fromArray(pos, ix[t] * 3); pb.fromArray(pos, ix[t + 1] * 3); pc.fromArray(pos, ix[t + 2] * 3);
      cr.subVectors(pb, pa).cross(pc.sub(pa));
      gn.fromArray(nor, ix[t] * 3);
      if (cr.dot(gn) < 0) { const s = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = s; }
    }
    return geo;
  })();

  /* pareti sottili verticali (griglia a 45° e nido d'ape): scatole unite, tagliate dalla maschera nello shader */
  const wallBox = (list, x, z, len, ang) => {
    const b = new THREE.BoxGeometry(len, H - 2 * S + 0.02, 0.012);
    b.rotateY(-ang); b.translate(x, H / 2, z);
    b.deleteAttribute('uv');
    list.push(layerUV(b));
  };
  const cx0 = (BOX.x0 + BOX.x1) / 2, cz0 = (BOX.z0 + BOX.z1) / 2, diag = Math.hypot(BOX.x1 - BOX.x0, BOX.z1 - BOX.z0);
  const gridGeo = (() => {
    const list = [], PG = 0.19;
    [Math.PI / 4, -Math.PI / 4].forEach((ang) => {
      const ux = Math.cos(ang), uz = Math.sin(ang), nx = -uz, nz = ux;
      for (let o = -diag / 2; o <= diag / 2; o += PG) wallBox(list, cx0 + nx * o, cz0 + nz * o, diag, ang);
    });
    return mergeGeometries(list);
  })();
  const honeyGeo = (() => {
    const list = [], R = 0.105, dx = Math.sqrt(3) * R, dz = 1.5 * R;
    for (let r = -1, z = BOX.z0 - R; z < BOX.z1 + R; r++, z += dz) {
      for (let x = BOX.x0 - dx + (r & 1 ? dx / 2 : 0); x < BOX.x1 + dx; x += dx) {
        for (let e = 0; e < 3; e++) {        // tre lati per esagono (gli altri li mette il vicino)
          const a0 = Math.PI / 6 + e * Math.PI / 3, a1 = a0 + Math.PI / 3;
          const px = x + R * (Math.cos(a0) + Math.cos(a1)) / 2, pz = z + R * (Math.sin(a0) + Math.sin(a1)) / 2;
          wallBox(list, px, pz, R + 0.012, a0 + 2 * Math.PI / 3);
        }
      }
    }
    return mergeGeometries(list);
  })();
  const infillG = group(part);
  const pats = [gyroidGeo, gridGeo, honeyGeo].map((geo, i) => add(infillG, geo, infillMat(i)));
  pats.forEach((m) => { m.frustumCulled = false; });
  const [patGyr, patGrid, patHoney] = pats;

  /* supporti ad albero (verde bambù) sotto l'aletta + brim */
  const supG = group(part);
  {
    const R0 = V(0.395, 0, 0.34), top = V(0.395, 0.105, 0.335);
    add(supG, taperTube([R0, V(0.393, 0.05, 0.338), top], 0.04, 0.027, 12, 16), supMat);
    add(supG, roundCyl(0.075, 0.012, 0.004, 32), supMat, R0.x, 0.006, R0.z);
    add(supG, new THREE.SphereGeometry(0.025, 20, 14), supMat, top.x, top.y, top.z);
    [[0.2, 0.16], [0.59, 0.16], [0.2, 0.5], [0.59, 0.5], [0.395, 0.53]].forEach(([x, z], i) => {
      const tip = V(x, H1 - 0.018, z);
      const mid = V(lerp(top.x, x, 0.55), lerp(top.y, tip.y, 0.42) + 0.01, lerp(top.z, z, 0.55));
      add(supG, taperTube([top, mid, tip], 0.022, 0.008, 20, 10), supMat);
      add(supG, new THREE.ConeGeometry(0.012, 0.017, 12).translate(0, 0.0085, 0), supMat, x, tip.y, z);
      if (i < 4) add(supG, new THREE.SphereGeometry(0.009, 10, 8), supMat, tip.x, tip.y, tip.z);
    });
  }
  const brimG = group(part);
  add(brimG, prism(offsetPoly(A, -0.15), [offsetPoly(A, -0.006)], 0, 0.011, 0.002, Math.PI / 4), brimMat);

  /* piano del taglio: foglio di luce oro che scorre */
  const sheetTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0, 'rgba(255,200,120,0)'); grd.addColorStop(0.5, 'rgba(255,205,130,0.35)'); grd.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,225,170,0.95)'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 252);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const sheet = add(part, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: sheetTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
  sheet.renderOrder = 9;
  const CUT_DIR = V(0.62, 0, 0.785).normalize();        // verso la camera (spazio del pezzo)
  const CUT_C0 = CUT_DIR.dot(V(0.075, 0, 0.2)) + 0.015, CUT_C1 = 1.25;
  sheet.quaternion.setFromUnitVectors(V(0, 0, 1), CUT_DIR);

  /* pozza di luce e ombra sotto il pezzo (fondo nero) */
  const poolTex = radialTexture([[0, 'rgba(255,255,255,0.16)'], [0.45, 'rgba(255,255,255,0.05)'], [1, 'rgba(255,255,255,0)']]);
  const shTex = radialTexture([[0, 'rgba(0,0,0,0.75)'], [0.55, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
  const pool = add(root, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false }), 0, -0.02, 0, -Math.PI / 2);
  pool.scale.set(4.6, 3.8, 1);
  const shade = add(root, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }), 0, -0.018, 0, -Math.PI / 2);
  shade.scale.set(2.6, 2.1, 1);
  const warmTex = radialTexture([[0, 'rgba(255,196,110,0.8)'], [0.35, 'rgba(255,170,80,0.3)'], [1, 'rgba(255,150,60,0)']]);
  const heatGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: warmTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0, blending: THREE.AdditiveBlending }));
  heatGlow.scale.set(3.2, 1.6, 1);
  heatGlow.position.set(0, H + 0.05, 0);
  root.add(heatGlow);

  /* ---------- inquadrature ---------- */
  const fitAll = fitOf(scene, [bottomG, wallsG, ...ringG, topLayers[0], topLayers[3], patGyr, supG, brimG]);
  const fitNoTop = fitOf(scene, [bottomG, wallsG, patGyr, brimG]);
  const fitWhole = fitOf(scene, [], boxPts(part, -0.95, 1.1, 0, H, -0.6, 1.0));
  const framer = makeFramer();
  const vA = framer.mkView(), vB = framer.mkView(), vC = framer.mkView(), vF = framer.mkView();

  /* ---------- etichette ---------- */
  const callouts = [...(ctx.overlay?.querySelectorAll('.callout[data-part]') || [])];
  const anchors = {
    skin: [topLayers[3], V(0.45, H, -0.42)],
    walls: [ringG[0], V(-0.59, 0.3, 0.95)],
    infill: [infillG, V(-0.62, 0.24, 0.26)],
    supports: [supG, V(0.5, 0.15, 0.36)],
    layers: [topG, V(1.05, H - S * 0.5, -0.24)]
  };

  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tmp = V(), tgt = V();
  const setY = (m, a, b) => { m.material.userData.u.uY.value.set(a, b); };

  function update(state) {
    const { p, t, w, h, aspect } = state;
    const idle = ctx.reduceMotion ? 0 : 1;
    const px = ctx.reduceMotion ? 0 : state.pointer.x;
    const desk = smoothstep((aspect - 0.85) / 0.2);
    const E = (r) => easeInOutCubic(seg(p, r[0], r[1]));

    /* ---- esplosione e ritorno ---- */
    const back = E([T.backA, T.backB]), close = E([T.closeA, T.closeB]);
    const eSkin = E(T.skin), eWalls = E(T.walls), eInf = E(T.infill), eSup = E(T.sup), eLay = E(T.layers);
    infillG.position.y = 0.3 * eInf * (1 - back);
    wallsG.position.y = 0.9 * eWalls * (1 - back);
    ringG.forEach((g, i) => { g.position.y = i * 0.055 * eLay * (1 - back); });
    topG.position.y = close > 0 ? lerp(0.85, 0, close) : 1.22 * eSkin * (1 - back) + 1.02 * back;
    topLayers.forEach((g, i) => { g.position.y = i * 0.07 * eLay * (1 - back); });
    const topOp = clamp01(1 - back * 1.25) + seg(p, T.closeA, T.closeA + 0.03);
    topMat.opacity = ironMat.opacity = clamp01(topOp);
    topG.visible = topOp > 0.01;
    topMat.depthWrite = ironMat.depthWrite = topOp > 0.98;

    /* supporti e brim: compaiono con l'esploso, poi scendono e spariscono (si staccano) */
    const grow = E([T.growA, T.growB]) * (1 - E([T.backA, T.backA + 0.045]));
    supG.visible = brimG.visible = grow > 0.005;
    supG.scale.set(1, Math.max(0.001, grow), 1);
    supMat.opacity = brimMat.opacity = clamp01(grow * 1.4);
    supG.position.y = brimG.position.y = -0.34 * eSup - 0.3 * back;
    brimG.scale.set(1, Math.max(0.001, grow), 1);

    /* ---- taglio ---- */
    const cutK = E([T.cutA, T.cutB]) * (1 - E([T.uncutA, T.uncutB]));
    const cOff = lerp(CUT_C1, CUT_C0, cutK);
    cutPlane.normal.copy(CUT_DIR).negate();
    cutPlane.constant = cOff;
    const sheetOn = Math.sin(Math.PI * clamp01(seg(p, T.cutA - 0.01, T.cutB + 0.035))) * (1 - E([T.uncutA, T.uncutB]));
    sheet.material.opacity = sheetOn * 0.95;
    sheet.visible = sheetOn > 0.01;
    sheet.position.copy(CUT_DIR).multiplyScalar(cOff);
    sheet.position.y = H / 2;
    sheet.scale.set(2.2, H + 0.3, 1);

    /* ---- riempimento: ristampa dal basso con il fronte caldo ---- */
    const y0 = S - 0.01, y1 = H - S + 0.01;
    const fr = T.pat.map((r) => seg(p, r[0], r[1]));
    const fy = fr.map((k) => lerp(y0, y1, easeInOutCubic(k)));
    const act = fr.map((k) => (k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0));
    patGyr.visible = p < T.pat[0][1] || p > T.pat[2][0];
    setY(patGyr, p < T.pat[0][1] ? (fr[0] > 0 ? fy[0] : -1) : -1, p < T.pat[0][1] ? 9 : (fr[2] < 1 ? fy[2] : 9));
    patGrid.visible = p > T.pat[0][0] && p < T.pat[1][1];
    setY(patGrid, p < T.pat[1][0] ? -1 : fy[1], p < T.pat[1][0] ? (fr[0] < 1 ? fy[0] : 9) : 9);
    patHoney.visible = p > T.pat[1][0] && p < T.pat[2][1];
    setY(patHoney, p < T.pat[2][0] ? -1 : fy[2], p < T.pat[2][0] ? (fr[1] < 1 ? fy[1] : 9) : 9);
    const fIdx = act[0] > 0 ? 0 : act[1] > 0 ? 1 : act[2] > 0 ? 2 : -1;
    pats.forEach((m) => m.material.userData.u.uFront.value.set(fIdx < 0 ? -9 : fy[fIdx], fIdx < 0 ? 0 : act[fIdx]));

    /* ---- calore finale: si accende alla chiusura e si raffredda ---- */
    const heat = seg(p, T.heatA, T.heatP) * (1 - smoothstep(seg(p, T.heatP, T.coolB)));
    pla.emissiveIntensity = heat * 0.1;
    topMat.emissiveIntensity = ironMat.emissiveIntensity = heat * 0.24;
    pats.forEach((m) => { m.material.emissiveIntensity = heat * 0.1; });
    heatGlow.material.opacity = heat * 0.4;

    /* ---- posa e luce radente ---- */
    const spin = lerp(-0.62, -0.18, smoothstep(seg(p, 0, 0.14)));
    const yaw = spin + lerp(0, -0.34, E([0.3, 0.6])) + lerp(0, 0.1, back) - lerp(0, 0.1, close)
      + (idle ? Math.sin(t * 0.3) * 0.05 + px * 0.1 : 0);
    root.rotation.y = yaw;
    const la = -0.9 + p * 1.6 + (idle ? Math.sin(t * 0.21) * 0.08 : 0);
    key.position.set(Math.cos(la) * 5, lerp(1.1, 3.2, smoothstep(seg(p, 0.1, 0.3))), Math.sin(la) * 5 + 1.5);
    pool.position.y = shade.position.y = -0.02 - 0.36 * eSup * (1 - back);
    shade.material.opacity = 1 - 0.6 * eSup * (1 - back);
    scene.updateMatrixWorld(true);
    cutW[0].copy(cutPlane).applyMatrix4(part.matrixWorld);

    /* ---- camera ---- */
    const offX = lerp(0, 0.225, desk), offY = lerp(0.2, 0, desk);
    camera.setViewOffset(w, h, -offX * w, offY * h, w, h);
    const availH = lerp(0.78, 0.44, desk), availV = lerp(0.42, 0.78, desk);
    const kV = 1 / (tanHalf * availV), kH = 1 / (tanHalf * aspect * availH);
    const ex = Math.max(eSkin, grow);
    const el = lerp(lerp(0.4, 0.5, E([T.cutA, T.cutB])) + 0.04 * ex, 1.0, back) - lerp(0, 0.58, close);
    framer.fitView(fitWhole, el, kV * 0.86, kH * 0.86, vA);
    framer.fitView(fitAll, el, kV, kH, vB);
    framer.fitView(fitNoTop, el, kV * 0.98, kH * 0.98, vC);
    framer.blendView(vA, vB, ex * (1 - back), vF);
    if (back > 0 && close < 1) framer.blendView(vF, vC, back * (1 - close), vF);
    if (close > 0) framer.blendView(vF, vA, close, vF);
    tgt.copy(vF.t);
    camera.position.set(tgt.x, tgt.y + Math.sin(vF.el) * vF.d, tgt.z + Math.cos(vF.el) * vF.d);
    camera.lookAt(tgt);
    camera.updateMatrixWorld();

    if (callouts.length) placeCallouts(ctx, callouts, anchors, ctx.project(tgt).x, w, tmp);
  }

  return {
    scene,
    camera,
    update,
    resize() {},
    dispose() {
      /* le maschere stanno negli uniform (non sui materiali): le libero qui */
      texA.dispose(); texB.dispose();
    }
  };
}
