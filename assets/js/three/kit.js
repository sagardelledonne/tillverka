/* Tillverka · attrezzi condivisi dalle scene "anatomy" e "audience" (stesso stile delle altre scene):
   forme arrotondate, texture procedurali, offset di poligoni, tubi rastremati, inquadratura automatica, etichette. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lerp } from './core.js';

export const TAU = Math.PI * 2;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ---------- mesh e gruppi ---------- */
export function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}
export function rbox(w, h, d, r, s = 3) {
  const m = Math.min(w, h, d) / 2 - 1e-4;
  return new RoundedBoxGeometry(w, h, d, s, Math.max(1e-4, Math.min(r, m)));
}
/* geometria senza indice (per unirle): evita l'avviso se lo è già */
export const flat = (g) => (g.index ? g.toNonIndexed() : g);

/* poligono chiuso con spigoli raccordati: pts = [[x, y, raggio?], ...] → Vector2[] (ultimo = primo) */
export function fillet(pts, rad = 0.004, n = 3, frac = 0.5) {
  const out = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const [x, y, rr = rad] = pts[i];
    const [ax, ay] = pts[(i - 1 + N) % N], [bx, by] = pts[(i + 1) % N];
    const la = Math.hypot(ax - x, ay - y), lb = Math.hypot(bx - x, by - y);
    const f = Math.min(rr, la * frac, lb * frac);
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
export const lathe = (corners, rad, segs, n = 3) => new THREE.LatheGeometry(fillet(corners, rad, n), segs);
/* cilindro tornito con spigoli arrotondati (asse Y, centrato); inner > 0 = anello */
export function roundCyl(r, h, rr, segs = 32, inner = 0) {
  rr = Math.min(rr, h / 2 - 1e-4, (r - inner) / 2 - 1e-4);
  if (inner > 0) return lathe([[inner, -h / 2, rr], [r, -h / 2, rr], [r, h / 2, rr], [inner, h / 2, rr]], rr, segs, 3);
  return lathe([[0, -h / 2, 0], [r, -h / 2, rr], [r, h / 2, rr], [0, h / 2, 0]], rr, segs, 3);
}

/* offset di un poligono chiuso (Vector2[], senza punto finale ripetuto): d > 0 = verso l'interno */
export function offsetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a.x * b.y - b.x * a.y; }
  const s = area > 0 ? 1 : -1;              // antiorario: l'interno è a sinistra
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], p = pts[i], b = pts[(i + 1) % n];
    let e1x = p.x - a.x, e1y = p.y - a.y, e2x = b.x - p.x, e2y = b.y - p.y;
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const n1x = -e1y * s, n1y = e1x * s, n2x = -e2y * s, n2y = e2x * s;
    let nx = n1x + n2x, ny = n1y + n2y;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const k = d / Math.max(0.35, nx * n1x + ny * n1y);
    out.push(new THREE.Vector2(p.x + nx * k, p.y + ny * k));
  }
  return out;
}
/* toglie i punti doppi (anche il finale ripetuto di fillet()) */
export function openPoly(pts, eps = 1e-5) {
  const out = [];
  pts.forEach((p) => { if (!out.length || out[out.length - 1].distanceTo(p) > eps) out.push(p); });
  while (out.length > 2 && out[0].distanceTo(out[out.length - 1]) <= eps) out.pop();
  return out;
}
export function circlePts(cx, cy, r, n = 48, cw = false) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (cw ? -1 : 1) * (i / n) * TAU; out.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  return out;
}

/* ---------- numeri e texture ---------- */
export function rng(seed) {                 // numeri casuali ripetibili (mulberry32)
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function noiseTex(size, lo, hi, seed) {
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
/* righe sottili ripetute lungo v (strati di stampa, tornitura) */
export function stripes(n, a = '#6a6a6a', b = '#ffffff') {
  return canvasTex(4, 256, (g, w, h) => {
    const step = h / n;
    for (let i = 0; i < n; i++) {
      const grd = g.createLinearGradient(0, i * step, 0, (i + 1) * step);
      grd.addColorStop(0, a); grd.addColorStop(0.5, b); grd.addColorStop(1, a);
      g.fillStyle = grd; g.fillRect(0, i * step, w, step);
    }
  }, false);
}
export function brushedTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h);
    const R = rng(11);
    for (let i = 0; i < 1400; i++) {
      const y = R() * h, v = Math.floor(90 + R() * 90);
      g.strokeStyle = `rgba(${v},${v},${v},0.35)`;
      g.lineWidth = R() * 1.2 + 0.2;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (R() - 0.5) * 2); g.stroke();
    }
  }, false);
}

/* tubo rastremato lungo una curva (rami dei supporti ad albero, cavi) */
export function taperTube(points, r0, r1, tubular = 24, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = V(), N = V();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    const r = lerp(r0, r1, Math.pow(t, 0.8));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a), s = Math.sin(a);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], c).addScaledVector(frames.binormals[i], s).normalize();
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      nor.push(N.x, N.y, N.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
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

/* ---------- inquadratura ---------- */
/* punti (angoli dei gruppi nel loro spazio) → coordinate mondo ogni fotogramma */
export function fitOf(scene, objs, extra = []) {
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
}
export const boxPts = (obj, x0, x1, y0, y1, z0, z1) => {
  const out = [];
  for (let i = 0; i < 8; i++) out.push([obj, V(i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0)]);
  return out;
};
/* centro e distanza perché tutti i punti stiano nella finestra utile (kV, kH = 1 / semi-apertura) */
export function makeFramer() {
  const wv = V(), bmin = V(), bmax = V();
  const mkView = () => ({ t: V(), d: 1, el: 0 });
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
    return out;
  };
  const blendView = (a, b, k, out) => {
    out.t.lerpVectors(a.t, b.t, k);
    out.d = a.d * Math.pow(b.d / a.d, k);
    out.el = lerp(a.el, b.el, k);
    return out;
  };
  return { mkView, fitView, blendView };
}

/* ---------- etichette: posizione a schermo e lato ---------- */
export function placeCallouts(ctx, callouts, anchors, centerX, w, tmp) {
  for (let i = 0; i < callouts.length; i++) {
    const el = callouts[i], an = anchors[el.dataset.part];
    if (!an) continue;
    tmp.copy(an[1]).applyMatrix4(an[0].matrixWorld);
    const s = ctx.project(tmp);
    el.style.setProperty('--x', s.x.toFixed(1) + 'px');
    el.style.setProperty('--y', s.y.toFixed(1) + 'px');
    let side = s.x < centerX ? 'left' : 'right';
    if (side === 'right' && s.x > w - 240) side = 'left';
    if (side === 'left' && s.x < 240) side = 'right';
    el.dataset.side = side;
  }
}
