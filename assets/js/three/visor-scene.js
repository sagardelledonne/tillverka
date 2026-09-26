/* Tillverka · scena "visor" (card 3D nella #storia, data-pin="view").
   La visiera protettiva del 2020: archetto stampato a doppia fascia con nervature e perni,
   tre agganci a incastro in oro, schermo trasparente curvo, elastico.
   p (view): 0.25–0.50 esplode lungo assi puliti, 0.50–0.75 si ricompone (scatto degli agganci).
   Unità: 1 ≈ 9,5 cm. Origine al centro della testa, y in alto, fronte verso +z. */
import * as THREE from 'three';
import { seg, smoothstep, easeInOutCubic, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture, layerLinesTexture } from './materials.js';

/* ---------- misure ---------- */
const A = 1.0, B = 0.86;          // semiassi dell'archetto (x, z)
const TH = 1.72;                  // semi-ampiezza della fascia interna (rad)
const TO = 1.34;                  // semi-ampiezza della fascia esterna
const TS = 1.28;                  // semi-ampiezza dello schermo
const SH_OFF = 0.172;             // distanza dello schermo dalla fascia interna
const SH_TOP = 0.015, SH_BOT = -1.75;
const CLIP_TH = [-0.62, 0, 0.62]; // posizione angolare dei tre agganci
const PIN_TH = [-1.02, -0.3, 0.3, 1.02];
const PIN_V = -0.035;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* punto sull'ellisse dell'archetto, spostato di off lungo la normale (in fuori) */
function arcPoint(th, off, out) {
  const x = A * Math.sin(th), z = B * Math.cos(th);
  let nx = Math.sin(th) * B, nz = Math.cos(th) * A;
  const l = Math.hypot(nx, nz); nx /= l; nz /= l;
  return out.set(x + nx * off, 0, z + nz * off);
}
function arcNormal(th, out) {
  const nx = Math.sin(th) * B, nz = Math.cos(th) * A, l = Math.hypot(nx, nz);
  return out.set(nx / l, 0, nz / l);
}

/* poligono con angoli arrotondati (raccordi a Bézier quadratica) */
function roundPoly(pts, r, n = 4) {
  const out = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const P = pts[i], Pa = pts[(i + N - 1) % N], Pc = pts[(i + 1) % N];
    const la = Math.hypot(Pa[0] - P[0], Pa[1] - P[1]), lc = Math.hypot(Pc[0] - P[0], Pc[1] - P[1]);
    const rr = Math.min(r, la * 0.45, lc * 0.45);
    const a = [P[0] + (Pa[0] - P[0]) / la * rr, P[1] + (Pa[1] - P[1]) / la * rr];
    const c = [P[0] + (Pc[0] - P[0]) / lc * rr, P[1] + (Pc[1] - P[1]) / lc * rr];
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * P[0] + t * t * c[0], u * u * a[1] + 2 * u * t * P[1] + t * t * c[1]]);
    }
  }
  return out;
}
const rectPoly = (u0, u1, v0, v1, r, n = 3) => roundPoly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], r, n);

/* estrusione di un profilo chiuso (u = in fuori, v = in alto, antiorario) lungo un percorso orizzontale.
   P[j] punti, N[j] normali orizzontali (= tangente × alto). uvScale: righe degli strati lungo v. */
function sweep(profile, P, N, { caps = true, vScale = 1, uScale = 1 } = {}) {
  const np = profile.length, ns = P.length;
  const pos = [], uv = [], idx = [];
  let len = 0;
  for (let j = 0; j < ns; j++) {
    if (j) len += P[j].distanceTo(P[j - 1]);
    for (let i = 0; i < np; i++) {
      const [u, v] = profile[i];
      pos.push(P[j].x + N[j].x * u, P[j].y + v, P[j].z + N[j].z * u);
      uv.push(len * uScale + u * uScale, v * vScale);
    }
  }
  for (let j = 0; j < ns - 1; j++) {
    for (let i = 0; i < np; i++) {
      const a = j * np + i, b = (j + 1) * np + i, c = (j + 1) * np + (i + 1) % np, d = j * np + (i + 1) % np;
      idx.push(a, b, c, a, c, d);
    }
  }
  if (caps) {
    const tri = THREE.ShapeUtils.triangulateShape(profile.map(([u, v]) => new THREE.Vector2(u, v)), []);
    [0, ns - 1].forEach((j, e) => {
      const base = pos.length / 3;
      for (let i = 0; i < np; i++) {
        const [u, v] = profile[i];
        pos.push(P[j].x + N[j].x * u, P[j].y + v, P[j].z + N[j].z * u);
        uv.push(u * uScale, v * vScale);
      }
      /* il verso delle facce dipende dal verso del profilo: controllato sulla normale media */
      tri.forEach(([a, b, c]) => (e ? idx.push(base + a, base + b, base + c) : idx.push(base + a, base + c, base + b)));
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/* percorso sull'arco dell'archetto */
function arcPath(th0, th1, n) {
  const P = [], N = [];
  for (let j = 0; j <= n; j++) {
    const th = lerp(th0, th1, j / n);
    P.push(arcPoint(th, 0, V()));
    N.push(arcNormal(th, V()));
  }
  return [P, N];
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ======================================================================= */
export async function create(ctx) {
  const light = ctx.theme === 'light';
  const small = ctx.small;
  const AS = small ? 72 : 120;             // suddivisioni lungo l'arco

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, light ? 0xc9ccd2 : 0x202226, light ? 0.6 : 0.5));
  const key = new THREE.DirectionalLight(0xffffff, light ? 1.6 : 1.9);
  key.position.set(-3, 4.5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xeaf0ff, light ? 1.1 : 1.6);
  rim.position.set(3.5, 2.5, -4);
  scene.add(rim);

  /* ---------- materiali ---------- */
  const layers = layerLinesTexture(128);
  const M = {
    band: mat.bambooGreen({ roughness: 0.46, clearcoat: 0.15, bumpMap: layers, bumpScale: 0.9 }),
    gold: mat.gold({ roughness: 0.2 }),
    shield: mat.glass({ color: light ? 0xb8c8d0 : 0xffffff, opacity: light ? 0.2 : 0.13, envMapIntensity: 1.9 }),
    edge: new THREE.MeshPhysicalMaterial({
      color: light ? 0x7f95a0 : 0xdfeef3, roughness: 0.1, metalness: 0, transparent: true,
      opacity: light ? 0.75 : 0.6, envMapIntensity: 1.4, depthWrite: false
    }),
    elastic: new THREE.MeshPhysicalMaterial({ color: light ? 0x2b2c30 : 0xcfd0d4, roughness: 0.85, metalness: 0, sheen: 0.6, sheenRoughness: 0.5, envMapIntensity: 0.6 }),
    ring: mat.matte(light ? 0x6c7c85 : 0xaebfc6, { transparent: true, opacity: 0.8 })
  };
  /* trama dell'elastico: coste longitudinali */
  const weave = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#b0b0b0' : '#505050'; g.fillRect(0, i * 8, w, 4); }
    for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * 4, 0, 1, h); }
  }, false);
  M.elastic.bumpMap = weave; M.elastic.bumpScale = 0.8;

  const root = new THREE.Group();          // posa generale (rotazione)
  scene.add(root);
  const model = new THREE.Group();
  root.add(model);

  /* ================= ARCHETTO ================= */
  const band = new THREE.Group();
  model.add(band);
  const vS = 200 / 128;                    // ~40 strati visibili sull'altezza della fascia
  {
    const [P, N] = arcPath(-TH, TH, AS);
    band.add(new THREE.Mesh(sweep(rectPoly(-0.022, 0.022, -0.1, 0.1, 0.012), P, N, { vScale: vS }), M.band));
    const [P2, N2] = arcPath(-TO, TO, AS);
    band.add(new THREE.Mesh(sweep(rectPoly(0.11, 0.146, -0.1, 0.02, 0.01), P2, N2, { vScale: vS }), M.band));
    // piastra di fondo che unisce le due fasce (visiera "a mensola")
    band.add(new THREE.Mesh(sweep(rectPoly(0.0, 0.13, -0.1, -0.082, 0.006), P2, N2, { vScale: vS }), M.band));
  }
  // nervature tra le due fasce
  {
    const ribTh = [];
    for (let i = 0; i < 11; i++) ribTh.push(lerp(-TO + 0.08, TO - 0.08, i / 10));
    // la nervatura va dalla fascia interna a quella esterna: box orientato lungo la normale
    const rg = new THREE.BoxGeometry(0.02, 0.07, 0.095);
    const inst = new THREE.InstancedMesh(rg, M.band, ribTh.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V(), n = V(), s = V(1, 1, 1);
    ribTh.forEach((th, i) => {
      arcPoint(th, 0.066, p); p.y = -0.047;
      arcNormal(th, n);
      q.setFromUnitVectors(V(0, 0, 1), n);
      m4.compose(p, q, s);
      inst.setMatrixAt(i, m4);
    });
    band.add(inst);
  }
  // perni che tengono lo schermo (bottoni con testa)
  const pinGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.05, 20);
  pinGeo.rotateX(Math.PI / 2);
  pinGeo.translate(0, 0, 0.025);
  const pinHead = new THREE.CylinderGeometry(0.028, 0.024, 0.012, 24);
  pinHead.rotateX(Math.PI / 2);
  pinHead.translate(0, 0, 0.052);
  {
    const i1 = new THREE.InstancedMesh(pinGeo, M.band, PIN_TH.length);
    const i2 = new THREE.InstancedMesh(pinHead, M.band, PIN_TH.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V(), n = V(), s = V(1, 1, 1);
    PIN_TH.forEach((th, i) => {
      arcPoint(th, 0.146, p); p.y = PIN_V;
      arcNormal(th, n);
      q.setFromUnitVectors(V(0, 0, 1), n);
      m4.compose(p, q, s);
      i1.setMatrixAt(i, m4); i2.setMatrixAt(i, m4);
    });
    band.add(i1, i2);
  }
  // linguette alle estremità con l'asola per l'elastico
  const tabs = [];
  {
    const s = new THREE.Shape();
    const pts = rectPoly(-0.06, 0.06, -0.1, 0.1, 0.03, 4);
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const hole = new THREE.Path();
    rectPoly(-0.018, 0.018, -0.075, 0.075, 0.016, 4).reverse().forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    s.holes.push(hole);
    const tg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 6 });
    tg.translate(0, 0, -0.015);
    [-1, 1].forEach((sg) => {
      const th = sg * TH;
      const p = arcPoint(th, 0, V()), n = arcNormal(th, V());
      const tan = V(n.z, 0, -n.x).multiplyScalar(-sg);   // verso l'esterno dell'estremità (dietro)
      const m = new THREE.Mesh(tg, M.band);
      m.position.copy(p).addScaledVector(tan, 0.07);
      m.lookAt(m.position.clone().add(n));
      band.add(m);
      tabs.push({ p: m.position.clone(), tan });
    });
  }

  /* ================= SCHERMO ================= */
  const shield = new THREE.Group();
  model.add(shield);
  const shieldOff = (y) => SH_OFF + (SH_TOP - y) * 0.09;   // si allarga un poco verso il basso
  {
    const nu = small ? 48 : 80, nv = small ? 20 : 32, R = 0.22;
    const W = TS, H = SH_TOP - SH_BOT;
    const pos = [], uv = [], idx = [];
    const p = V();
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        let s = lerp(-W, W, i / nu), y = lerp(SH_BOT, SH_TOP, j / nv);
        // angoli in basso arrotondati: i punti fuori dal raccordo scivolano sull'arco (in unità "angolari" ~ metriche)
        const cx = W - R, cy = SH_BOT + R;
        if (Math.abs(s) > cx && y < cy) {
          const dx = Math.abs(s) - cx, dy = y - cy, d = Math.hypot(dx, dy);
          if (d > R) { s = Math.sign(s) * (cx + dx / d * R); y = cy + dy / d * R; }
        }
        arcPoint(s, shieldOff(y), p);
        pos.push(p.x, y, p.z);
        uv.push(i / nu, j / nv);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      idx.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    shield.add(new THREE.Mesh(g, M.shield));
    // riflessi morbidi (bande verticali)
    const streak = canvasTex(256, 64, (g2, w, h) => {
      g2.clearRect(0, 0, w, h);
      const band2 = (x0, wd, a) => {
        const gr = g2.createLinearGradient(x0, 0, x0 + wd, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g2.fillStyle = gr; g2.fillRect(x0, 0, wd, h);
      };
      band2(40, 60, 0.55); band2(112, 10, 0.8); band2(170, 36, 0.3);
    });
    streak.wrapS = streak.wrapT = THREE.ClampToEdgeWrapping;
    const sm = new THREE.MeshBasicMaterial({
      map: streak, transparent: true, opacity: light ? 0.0 : 0.22, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1
    });
    const st = new THREE.Mesh(g, sm);
    st.renderOrder = 3;
    shield.add(st);
    shield.userData.streak = sm;
    // bordo tagliato del foglio: tubicino lungo il perimetro
    const per = [];
    const cx = W - R, cy = SH_BOT + R;
    const pushP = (s, y) => { arcPoint(s, shieldOff(y), p); per.push(V(p.x, y, p.z)); };
    for (let i = 0; i <= 40; i++) pushP(lerp(-W, W, i / 40), SH_TOP);
    for (let i = 1; i <= 16; i++) pushP(W, lerp(SH_TOP, cy, i / 16));
    for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pushP(cx + Math.cos(a) * R, cy - Math.sin(a) * R); }
    for (let i = 1; i <= 40; i++) pushP(lerp(cx, -cx, i / 40), SH_BOT);
    for (let i = 1; i <= 8; i++) { const a = Math.PI / 2 + (i / 8) * Math.PI / 2; pushP(-cx + Math.cos(a) * R, cy - Math.sin(a) * R); }
    for (let i = 1; i < 16; i++) pushP(-W, lerp(cy, SH_TOP, i / 16));
    const edgeCurve = new THREE.CatmullRomCurve3(per, true, 'centripetal');
    shield.add(new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, small ? 180 : 320, 0.006, 5, true), M.edge));
    // fori del foglio in corrispondenza dei perni (anellini)
    const ringGeo = new THREE.TorusGeometry(0.026, 0.004, 6, 24);
    PIN_TH.forEach((th) => {
      const m = new THREE.Mesh(ringGeo, M.ring);
      arcPoint(th, shieldOff(PIN_V), m.position); m.position.y = PIN_V;
      m.lookAt(m.position.clone().add(arcNormal(th, V())));
      shield.add(m);
    });
  }

  /* ================= AGGANCI (tre, oro) ================= */
  const clips = [];
  {
    // profilo a C con il dente che trattiene lo schermo (l'incastro)
    const prof = roundPoly([
      [0.086, -0.062], [0.104, -0.062], [0.104, 0.026], [0.19, 0.026], [0.19, -0.084], [0.179, -0.1], [0.19, -0.116],
      [0.215, -0.116], [0.218, 0.068], [0.086, 0.068]
    ], 0.007, 3);
    const half = 0.13;
    CLIP_TH.forEach((th0) => {
      const g = new THREE.Group();
      model.add(g);
      // geometria costruita attorno all'angolo 0, poi ruotata sull'arco: resta identica per i tre
      const [P, N] = arcPath(th0 - half, th0 + half, 12);
      const c = arcPoint(th0, 0, V());
      P.forEach((q) => q.sub(c));
      const geo = sweep(prof, P, N, { vScale: vS });
      const m = new THREE.Mesh(geo, M.gold);
      g.add(m);
      // tre costine di presa sul dorso
      [-0.07, -0.035, 0, 0.035, 0.07].forEach((d) => {
        const [P2, N2] = arcPath(th0 + d - 0.009, th0 + d + 0.009, 2);
        P2.forEach((q) => q.sub(c));
        g.add(new THREE.Mesh(sweep(rectPoly(0.215, 0.228, -0.1, 0.05, 0.005, 2), P2, N2), M.gold));
      });
      g.position.copy(c);
      clips.push({ g, th: th0, base: c.clone(), n: arcNormal(th0, V()) });
    });
  }

  /* ================= ELASTICO ================= */
  const elastic = new THREE.Group();
  model.add(elastic);
  {
    const [tl, tr] = tabs;
    const pts = [
      tl.p.clone(),
      V(-1.08, -0.01, -0.62), V(-0.78, -0.02, -1.12), V(0, -0.03, -1.34), V(0.78, -0.02, -1.12), V(1.08, -0.01, -0.62),
      tr.p.clone()
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const n = small ? 60 : 110;
    const P = [], N = [], T = V();
    for (let j = 0; j <= n; j++) {
      const u = j / n;
      P.push(curve.getPointAt(u, V()));
      curve.getTangentAt(u, T);
      N.push(V(-T.z, 0, T.x).normalize());
    }
    elastic.add(new THREE.Mesh(sweep(rectPoly(-0.007, 0.007, -0.066, 0.066, 0.005, 2), P, N, { vScale: 10, uScale: 6 }), M.elastic));
  }

  /* ---------- ombra di contatto / pozza di luce ---------- */
  const FLOOR_Y = -2.2;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({
    map: radialTexture(light
      ? [[0, 'rgba(20,22,28,0.3)'], [0.45, 'rgba(20,22,28,0.12)'], [1, 'rgba(20,22,28,0)']]
      : [[0, 'rgba(255,255,255,0.10)'], [0.5, 'rgba(255,255,255,0.035)'], [1, 'rgba(255,255,255,0)']]),
    transparent: true, depthWrite: false
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = FLOOR_Y;
  root.add(shadow);

  /* ---------- lampo dello scatto (agganci che si incastrano) ---------- */
  const flashTex = radialTexture([[0, 'rgba(255,226,160,1)'], [0.3, 'rgba(236,208,143,0.45)'], [1, 'rgba(217,179,106,0)']]);
  const flashes = clips.map((c) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0 }));
    s.scale.setScalar(0.5);
    c.g.add(s);
    s.position.set(c.n.x * 0.15, 0.04, c.n.z * 0.15);
    return s;
  });

  /* ---------- etichette ---------- */
  const callouts = [...(ctx.overlay?.querySelectorAll('.callout[data-part]') || [])];
  const anchors = {
    band: [band, arcPoint(-1.45, 0.02, V()).setY(0.1)],
    clips: [clips[1].g, V(0, 0.07, 0.22)],
    shield: [shield, arcPoint(0.75, shieldOff(-1.3), V()).setY(-1.3)]
  };

  /* ---------- punti per l'inquadratura: vertici campionati dei pezzi (più stretti dei box) ---------- */
  model.updateMatrixWorld(true);
  const fit = [];
  {
    const inv = new THREE.Matrix4(), q = V();
    [band, shield, elastic, ...clips.map((c) => c.g)].forEach((obj) => {
      inv.copy(obj.matrixWorld).invert();
      const meshes = [];
      obj.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry.attributes.position) meshes.push(o); });
      const total = meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0);
      const step = Math.max(1, Math.floor(total / 90));
      meshes.forEach((m) => {
        const pa = m.geometry.attributes.position;
        for (let i = 0; i < pa.count; i += step) fit.push([obj, q.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv).clone()]);
      });
    });
  }
  const wFit = fit.map(() => V());
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tgt = V(), wv = V(), bmin = V(), bmax = V(), camDir = V();
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
  /* distanza della camera ammorbidita: l'inquadratura non "pompa" a ogni fotogramma */
  let camD = 0, camT = V(), camInit = false;

  return {
    scene,
    camera,
    update(state) {
      const { p, t, dt, pointer, w, h, aspect } = state;
      const idle = ctx.reduceMotion ? 0 : 1;

      /* ---------- esplosione (0.25–0.50) e ricomposizione (0.50–0.75), a gruppi sfalsati ---------- */
      const E = (a0, a1, b0, b1) => easeInOutCubic(seg(p, a0, a1)) * (1 - easeInOutCubic(seg(p, b0, b1)));
      const eClip = [E(0.25, 0.4, 0.62, 0.74), E(0.27, 0.42, 0.63, 0.75), E(0.29, 0.44, 0.61, 0.73)];
      const eShield = E(0.3, 0.46, 0.56, 0.7);
      const eElastic = E(0.33, 0.48, 0.52, 0.66);

      clips.forEach((c, i) => {
        const e = eClip[i];
        c.g.position.copy(c.base).addScaledVector(c.n, e * 0.32);
        c.g.position.y = e * 0.62;
        c.g.rotation.set(0, 0, 0);
        c.g.rotateOnAxis(wv.set(c.n.z, 0, -c.n.x), -e * 0.35);
      });
      shield.position.set(0, -eShield * 0.28, eShield * 0.78);
      shield.rotation.x = eShield * 0.06;
      elastic.position.set(0, eElastic * 0.12, -eElastic * 0.62);
      elastic.rotation.x = -eElastic * 0.05;

      /* scatto: lampo oro quando gli agganci tornano a posto */
      flashes.forEach((s, i) => {
        const k = seg(p, [0.735, 0.745, 0.725][i], [0.79, 0.8, 0.78][i]);
        s.material.opacity = (k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0) * 0.9;
      });

      /* ---------- rotazione (giradischi lento) + moto idle ---------- */
      const rot = track(p, [[0, -1.0], [0.25, -0.78], [0.5, -0.62], [0.75, -0.42], [1, -0.2]]);
      root.rotation.y = rot + (idle ? Math.sin(t * 0.45) * 0.07 + pointer.x * 0.1 : 0);
      model.position.y = idle ? Math.sin(t * 0.8) * 0.025 : 0;
      scene.updateMatrixWorld(true);

      /* ---------- camera: inquadra sempre tutti i pezzi ---------- */
      const el = 0.36 - pointer.y * 0.04 * idle;
      const kV = 1 / (tanHalf * 0.8), kH = 1 / (tanHalf * aspect * 0.84);
      for (let i = 0; i < fit.length; i++) wFit[i].copy(fit[i][1]).applyMatrix4(fit[i][0].matrixWorld);
      fitView(wFit, el, kV, kH, view);
      if (!camInit || ctx.reduceMotion) { camD = view.d; camT.copy(view.t); camInit = true; }
      else {
        const k = 1 - Math.exp(-6 * (dt || 0.016));
        camD = lerp(camD, view.d, k);
        camT.lerp(view.t, k);
      }
      tgt.copy(camT);
      camDir.set(0, Math.sin(el), Math.cos(el));
      camera.position.copy(tgt).addScaledVector(camDir, camD);
      camera.lookAt(tgt);
      camera.updateMatrixWorld();

      /* ---------- etichette ---------- */
      if (callouts.length) {
        const cx = ctx.project(tgt).x;
        for (let i = 0; i < callouts.length; i++) {
          const elc = callouts[i], an = anchors[elc.dataset.part];
          if (!an) continue;
          wv.copy(an[1]).applyMatrix4(an[0].matrixWorld);
          const s = ctx.project(wv);
          elc.style.setProperty('--x', s.x.toFixed(1) + 'px');
          elc.style.setProperty('--y', s.y.toFixed(1) + 'px');
          let side = s.x < cx ? 'left' : 'right';
          if (side === 'right' && s.x > w - 160) side = 'left';
          if (side === 'left' && s.x < 160) side = 'right';
          elc.dataset.side = side;
        }
      }
    },
    resize() {},
    dispose() {
      layers.dispose(); weave.dispose(); flashTex.dispose();
    }
  };
}
