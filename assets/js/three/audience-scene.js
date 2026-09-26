/* Tillverka · scena "audience" (#perchi, sfondo nero): per chi lavoriamo, tre oggetti uno sotto l'altro.
   1) Aziende      p 0.00–0.33  riduttore epicicloidale (gusci grafite + argento, sole, 3 satelliti, corona,
                                portasatelliti, alberi, cuscinetti, viti oro, guarnizione bambù): vista esplosa
                                lungo l'asse 0.06–0.22 con gli ingranaggi che girano ingranando, ricomposizione 0.26–0.33
   2) Architetti   p 0.33–0.66  plastico: terreno a curve di livello in legno di bambù, edificio bianco con fasce
                                vetrate; 0.40–0.55 i piani si separano mostrando solai e pareti interne; alberelli
   3) Designer     p 0.66–1.00  vaso parametrico in filo seta verde bambù → oro: si stampa, cambia forma tre volte
                                (0.68–0.88), esplode in anelli-strato (0.88–0.96) e si ricompone
   Tra un oggetto e l'altro la camera scende. Pose = funzioni pure di p (+ piccolo moto idle con t e puntatore). */
import * as THREE from 'three';
import { seg, smoothstep, easeInOutCubic, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture } from './materials.js';
import {
  TAU, V, add, group, rbox, fillet, lathe, roundCyl, openPoly, circlePts, rng, noiseTex, stripes, brushedTexture,
  fitOf, boxPts, makeFramer, placeCallouts
} from './kit.js';

/* ---------- tempi ---------- */
const T = {
  x12A: 0.305, x12B: 0.362, x23A: 0.636, x23B: 0.692,
  sepA: 0.4, sepB: 0.55, joinA: 0.575, joinB: 0.628,
  growA: 0.664, growB: 0.708, m1A: 0.735, m1B: 0.785, m2A: 0.815, m2B: 0.865,
  vxA: 0.88, vxB: 0.928, vjA: 0.95, vjB: 0.994
};
/* esplosione del riduttore lungo l'asse: [inizio, fine, spostamento] */
/* sole, satelliti e corona restano insieme al centro: si vedono girare ingranati */
const GX = {
  housA: [0.06, 0.15, -1.05], bearA: [0.08, 0.17, -0.46], gasket: [0.1, 0.19, 0.27], carrier: [0.09, 0.18, 0.5],
  bearB: [0.08, 0.17, 0.82], housB: [0.06, 0.15, 1.1], screws: [0.11, 0.22, 1.42]
};
const REA = 0.262, REB = 0.33;                 // ricomposizione

/* ---------- ingranaggi a evolvente ---------- */
const PA = (20 * Math.PI) / 180;
const INV = (a) => Math.tan(a) - a;
const MOD = 0.022, ZS = 12, ZP = 15, ZR = ZS + 2 * ZP;   // (ZS + ZR) / 3 intero: tre satelliti a 120°
const RS = (MOD * ZS) / 2, RP = (MOD * ZP) / 2, RR = (MOD * ZR) / 2, ARM = RS + RP;
/* contorno di un ingranaggio esterno (per la corona: il foro, con addendum e dedendum scambiati) */
function gearOutline(Z, m, addm = 1, dedm = 1.25, nF = 6) {
  const r = (m * Z) / 2, rb = r * Math.cos(PA), ra = r + addm * m, rf = r - dedm * m;
  const half = Math.PI / (2 * Z) + INV(PA);
  const phi = (R) => (R <= rb ? 0 : INV(Math.acos(rb / R)));
  const r0 = Math.max(rf, rb);
  const pts = [];
  const P = (R, a) => pts.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R));
  for (let k = 0; k < Z; k++) {
    const c = (k * TAU) / Z;
    P(rf, c - Math.PI / Z);
    P(rf, c - half - 0.25 * (Math.PI / Z - half));
    if (rb > rf) P(rb, c - half);
    for (let i = 1; i <= nF; i++) { const R = r0 + ((ra - r0) * i) / nF; P(R, c - half + phi(R)); }
    P(ra, c);
    for (let i = nF; i >= 1; i--) { const R = r0 + ((ra - r0) * i) / nF; P(R, c + half - phi(R)); }
    if (rb > rf) P(rb, c + half);
    P(rf, c + half + 0.25 * (Math.PI / Z - half));
  }
  return pts;
}
/* estrusione lungo z (spessore w, centrata), con fori */
function extrudeZ(outer, holes, w, bev = 0.004) {
  const sh = new THREE.Shape(outer);
  holes.forEach((h) => sh.holes.push(new THREE.Path(h)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: w - 2 * bev, bevelEnabled: true, bevelSize: bev * 0.8, bevelThickness: bev, bevelSegments: 2, curveSegments: 24 });
  g.translate(0, 0, -w / 2 + bev);
  return g;
}
/* solido tornito attorno all'asse z (profilo (r, z) antiorario) */
const latheZ = (corners, rad, segs, n = 3) => lathe(corners, rad, segs, n).rotateX(Math.PI / 2);
/* uv per righe lungo l'asse (strati, filetti): u = angolo, v = z * k */
function uvZ(geo, k) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getY(i), p.getX(i)) / TAU + 0.5; uv[i * 2 + 1] = p.getZ(i) * k; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/* ======================================================================= */
export async function create(ctx) {
  const small = ctx.small;
  const CS = small ? 40 : 72;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  scene.add(new THREE.HemisphereLight(0xe6e9f2, 0x16161a, 0.45));
  const key = new THREE.DirectionalLight(0xfff3e4, 2.3);
  key.position.set(-3, 4.5, 3.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8e4ff, 1.6);
  rim.position.set(3.4, 2.4, -3.8);
  scene.add(rim);
  const fillL = new THREE.DirectionalLight(0xffffff, 0.4);
  fillL.position.set(2.5, 1.5, 4);
  scene.add(fillL);

  /* ---------- materiali comuni ---------- */
  const brushed = brushedTexture();
  const M = {
    graphite: mat.graphite({ color: 0x3a3b41, metalness: 0.35, roughness: 0.46, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 1.5 }),
    alu: mat.satinSilver({ color: 0xd9dce2, roughness: 0.5, bumpMap: brushed, bumpScale: 0.1, envMapIntensity: 2.4, clearcoat: 0.5, clearcoatRoughness: 0.12 }),
    aluBright: mat.satinSilver({ color: 0xe3e6eb, roughness: 0.34, envMapIntensity: 2.2 }),
    chrome: mat.liquidSilver({ roughness: 0.06 }),
    silver: mat.liquidSilver({ color: 0xe6e8ec, roughness: 0.3, envMapIntensity: 2.2 }),
    gold: mat.gold({ roughness: 0.24, envMapIntensity: 1.9 }),
    goldSatin: mat.gold({ roughness: 0.34, envMapIntensity: 1.8 }),
    black: mat.matte(0x0b0b0d, { roughness: 0.4, clearcoat: 0.4 }),
    green: mat.bambooGreen({ roughness: 0.42, clearcoat: 0.3 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf0efeb, roughness: 0.58, metalness: 0, clearcoat: 0.08, envMapIntensity: 0.55 }),
    whiteSoft: new THREE.MeshPhysicalMaterial({ color: 0xe4e2dc, roughness: 0.7, metalness: 0, envMapIntensity: 0.45 }),
    glass: mat.glass({ color: 0xcfe0ee, opacity: 0.22, roughness: 0.04, envMapIntensity: 1.9 }),
    wood: mat.bambooWood({ roughness: 0.55, clearcoat: 0.25 }),
    woodDark: mat.bambooWood({ color: 0xd8c6a4, roughness: 0.6, clearcoat: 0.2 }),
    leaf: mat.matte(COLORS.bamboo, { roughness: 0.62, envMapIntensity: 0.6 })
  };
  const poolTex = radialTexture([[0, 'rgba(255,255,255,0.15)'], [0.45, 'rgba(255,255,255,0.045)'], [1, 'rgba(255,255,255,0)']]);
  const shTex = radialTexture([[0, 'rgba(0,0,0,0.8)'], [0.55, 'rgba(0,0,0,0.32)'], [1, 'rgba(0,0,0,0)']]);
  const floorPlate = (parent, sx, sz, y, tex, o = 1) => {
    const m = add(parent, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: o }), 0, y, 0, -Math.PI / 2);
    m.scale.set(sx, sz, 1);
    return m;
  };

  /* =====================================================================
     OGGETTO 1 · RIDUTTORE EPICICLOIDALE (asse locale z)
     ===================================================================== */
  const H1 = group(scene);
  const gbPose = group(H1, 0, 0.72, 0);         // posa (imbardata + inclinazione dell'asse)
  gbPose.rotation.order = 'YXZ';
  const gb = group(gbPose);
  const PART = {};
  const part = (name) => (PART[name] = group(gb));

  // guscio A (argento satinato), aperto verso +z, con mozzo e flangia
  const housA = part('housA');
  add(housA, latheZ([[0.072, -0.52, 0.004], [0.2, -0.52, 0.02], [0.2, -0.47, 0.012], [0.44, -0.445, 0.05], [0.6, -0.33, 0.1], [0.6, -0.16, 0.012],
    [0.7, -0.16, 0.014], [0.7, -0.09, 0.01], [0.53, -0.09, 0.006], [0.53, -0.36, 0.03], [0.14, -0.395, 0.012], [0.14, -0.455, 0.006], [0.072, -0.455, 0.004]], 0.01, CS), M.alu);
  // guscio B (grafite), aperto verso -z (profilo specchiato, verso invertito)
  const housB = part('housB');
  {
    const prof = [[0.1, 0.56, 0.004], [0.27, 0.56, 0.02], [0.27, 0.5, 0.012], [0.46, 0.47, 0.05], [0.6, 0.36, 0.1], [0.6, 0.17, 0.012],
      [0.7, 0.17, 0.014], [0.7, 0.1, 0.01], [0.53, 0.1, 0.006], [0.53, 0.38, 0.03], [0.2, 0.42, 0.012], [0.2, 0.48, 0.006], [0.1, 0.48, 0.004]].reverse();
    add(housB, latheZ(prof, 0.01, CS), M.graphite);
  }
  // fori e teste delle viti sulle flange, nervature del guscio A
  const SCREW_R = 0.655, NSC = 6;
  // corona (dentatura interna), argento vivo
  const ringG = part('ring');
  {
    const holeGear = gearOutline(ZR, MOD, 1.25, 1.0, small ? 4 : 6);
    const outer = circlePts(0, 0, 0.6, 120);
    add(ringG, extrudeZ(outer, [holeGear], 0.18, 0.006), M.silver);
  }
  // guarnizione verde bambù tra corona e guscio B
  const gasG = part('gasket');
  add(gasG, extrudeZ(circlePts(0, 0, 0.69, 120), [circlePts(0, 0, 0.535, 120, true)], 0.012, 0.002), M.green, 0, 0, 0.095);
  // sole (oro) con albero d'ingresso e linguetta
  const sunG = part('sun');
  {
    const bore = circlePts(0, 0, 0.05, 40, true);
    add(sunG, extrudeZ(gearOutline(ZS, MOD), [bore], 0.14), M.gold);
    const sh = latheZ([[0, -0.9, 0], [0.05, -0.9, 0.008], [0.055, -0.89, 0.004], [0.055, 0.06, 0.004], [0, 0.06, 0]], 0.004, 40);
    add(sunG, sh, M.chrome);
    add(sunG, rbox(0.022, 0.03, 0.2, 0.004), M.gold, 0, 0.054, -0.72);
  }
  // satelliti (argento satinato) con boccola oro
  const planetsG = part('planets');
  const planets = [];
  {
    const geo = extrudeZ(gearOutline(ZP, MOD), [circlePts(0, 0, 0.046, 40, true)], 0.13);
    const bush = roundCyl(0.046, 0.132, 0.003, 32, 0.036).rotateX(Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const g = group(planetsG);
      add(g, geo, M.aluBright);
      add(g, bush, M.goldSatin);
      planets.push(g);
    }
  }
  // portasatelliti (grafite) a tre lobi con perni cromati e albero d'uscita
  const carG = part('carrier');
  {
    const lobes = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU, r = 0.31 + 0.09 * Math.cos(3 * a); lobes.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    add(carG, extrudeZ(lobes, [], 0.06, 0.006), M.graphite, 0, 0, 0.12);
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3;
      add(carG, roundCyl(0.034, 0.2, 0.006, 28).rotateX(Math.PI / 2), M.chrome, Math.cos(a) * ARM, Math.sin(a) * ARM, 0.02);
      add(carG, roundCyl(0.05, 0.012, 0.003, 28).rotateX(Math.PI / 2), M.gold, Math.cos(a) * ARM, Math.sin(a) * ARM, 0.156);
    }
    add(carG, latheZ([[0, 0.12, 0], [0.13, 0.12, 0.01], [0.13, 0.2, 0.01], [0.09, 0.22, 0.006], [0.09, 0.96, 0.01], [0.075, 0.975, 0.004], [0, 0.975, 0]], 0.006, 48), M.chrome);
    add(carG, rbox(0.03, 0.03, 0.24, 0.005), M.gold, 0, 0.088, 0.8);
  }
  // cuscinetti a sfere: anelli in acciaio, sfere cromate, gabbia oro
  const bearing = (parent, rin, rout, w, z, nb) => {
    const g = group(parent, 0, 0, z);
    const mid = (rin + rout) / 2, t = (rout - rin) * 0.28;
    add(g, latheZ([[mid + t * 0.55, -w / 2], [rout, -w / 2], [rout, w / 2], [mid + t * 0.55, w / 2]], 0.004, CS), M.aluBright);
    add(g, latheZ([[rin, -w / 2], [mid - t * 0.55, -w / 2], [mid - t * 0.55, w / 2], [rin, w / 2]], 0.004, CS), M.aluBright);
    const ball = new THREE.SphereGeometry(t * 0.95, 16, 12);
    const balls = new THREE.InstancedMesh(ball, M.chrome, nb);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nb; i++) { const a = (i / nb) * TAU; m4.makeTranslation(Math.cos(a) * mid, Math.sin(a) * mid, 0); balls.setMatrixAt(i, m4); }
    g.add(balls);
    add(g, new THREE.TorusGeometry(mid, t * 0.28, 8, CS), M.goldSatin, 0, 0, w * 0.32);
    return g;
  };
  const bearAG = part('bearA');
  bearing(bearAG, 0.055, 0.14, 0.06, -0.425, 9);
  const bearBG = part('bearB');
  bearing(bearBG, 0.09, 0.2, 0.075, 0.445, 12);
  // viti a testa cilindrica (oro) con esagono incassato
  const screwG = part('screws');
  const screws = [];
  {
    const thr = stripes(22, '#555', '#fff');
    const shankMat = mat.gold({ roughness: 0.22, bumpMap: thr, bumpScale: 1 });
    const head = latheZ([[0, 0.17, 0], [0.036, 0.17, 0.006], [0.036, 0.215, 0.008], [0, 0.215, 0]], 0.006, 32);
    const shank = uvZ(new THREE.CylinderGeometry(0.017, 0.017, 0.36, 18).rotateX(Math.PI / 2).translate(0, 0, -0.01), 3);
    const socket = new THREE.CylinderGeometry(0.016, 0.016, 0.01, 6).rotateX(Math.PI / 2).translate(0, 0, 0.212);
    for (let j = 0; j < NSC; j++) {
      const a = ((j + 0.5) / NSC) * TAU;
      const s = group(screwG, Math.cos(a) * SCREW_R, Math.sin(a) * SCREW_R, 0);
      add(s, head, M.gold); add(s, shank, shankMat); add(s, socket, M.black);
      screws.push(s);
    }
  }
  const gbParts = Object.values(PART);
  const gbBase = new Map(gbParts.map((g) => [g, g.position.z]));
  const fit1 = fitOf(scene, gbParts);
  const gbPool = floorPlate(H1, 4.2, 3.2, -0.005, poolTex);
  const gbShade = floorPlate(H1, 3.0, 1.9, -0.003, shTex, 0.9);

  /* =====================================================================
     OGGETTO 2 · PLASTICO ARCHITETTONICO
     ===================================================================== */
  const H2Y = -3.2;
  const H2 = group(scene, 0, H2Y, 0);
  const arch = group(H2);
  const BW = 2.3, BD = 1.7;
  // basamento grafite con filo oro
  add(arch, rbox(BW, 0.08, BD, 0.02, 3), M.graphite, 0, 0.04, 0);
  add(arch, rbox(BW + 0.006, 0.006, BD + 0.006, 0.003, 2), M.goldSatin, 0, 0.078, 0);
  // terreno: curve di livello impilate (collina in fondo a sinistra, pianoro davanti a destra per l'edificio)
  const siteG = group(arch, 0, 0.081, 0);
  const LAY = 0.046, LAYT = 0.042, NL = 7;
  const HILL = V(-0.92, 0, -0.62), BLD = { x: 0.4, z: 0.2, w: 0.76, d: 0.56 };
  const toward = Math.atan2(BLD.z - HILL.z, BLD.x - HILL.x);
  const R = rng(5);
  const ph = [R() * TAU, R() * TAU, R() * TAU];
  const layerPolys = [];
  const clampB = (v, lim) => Math.max(-lim, Math.min(lim, v));
  for (let k = 0; k < NL; k++) {
    let pts;
    if (k === 0) pts = openPoly(fillet([[-1.1, -0.8, 0.05], [1.1, -0.8, 0.05], [1.1, 0.8, 0.05], [-1.1, 0.8, 0.05]], 0.05, 4));
    else {
      const R0 = [0, 1.42, 1.13, 0.88, 0.66, 0.46, 0.28][k];
      pts = [];
      for (let i = 0; i < 128; i++) {
        const a = (i / 128) * TAU;
        const f = (1 + 0.13 * Math.sin(3 * a + ph[0] + k * 0.4) + 0.07 * Math.sin(5 * a + ph[1] - k * 0.3) + 0.035 * Math.sin(9 * a + ph[2])) * (1 - 0.34 * Math.max(0, Math.cos(a - toward)));
        pts.push(new THREE.Vector2(clampB(HILL.x + Math.cos(a) * R0 * f, 1.1), clampB(HILL.z + Math.sin(a) * R0 * f, 0.8)));
      }
      pts = openPoly(pts, 0.002);
    }
    layerPolys.push(pts);
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: LAYT - 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.002, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, 0, 0.002);
    g.rotateX(-Math.PI / 2);
    add(siteG, g, k % 2 ? M.woodDark : M.wood, 0, k * LAY, 0);
  }
  const inPoly = (pts, x, z) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const groundAt = (x, z) => { let k = 0; for (let i = 0; i < NL; i++) if (inPoly(layerPolys[i], x, z)) k = i; return 0.081 + (k + 1) * LAY - 0.004; };
  // vialetto bianco verso l'ingresso
  add(arch, rbox(0.12, 0.006, 0.42, 0.003, 2), M.whiteSoft, BLD.x - 0.05, groundAt(0.3, 0.7) + 0.003, 0.68);
  // alberelli da plastico: tronco sottile + chioma poligonale verde bambù
  {
    const N = small ? 18 : 28;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.008, 1, 6).translate(0, 0.5, 0), M.woodDark, N);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), M.leaf, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), ps = V();
    let n = 0, tries = 0;
    const RT = rng(17);
    while (n < N && tries < 800) {
      tries++;
      const x = (RT() - 0.5) * 2.05, z = (RT() - 0.5) * 1.45;
      if (Math.abs(x - BLD.x) < BLD.w / 2 + 0.12 && Math.abs(z - BLD.z) < BLD.d / 2 + 0.12) continue;
      if (Math.abs(x - (BLD.x - 0.05)) < 0.1 && z > BLD.z) continue;
      const y = groundAt(x, z), hgt = 0.07 + RT() * 0.07, cr = 0.045 + RT() * 0.03;
      m4.compose(ps.set(x, y, z), q.identity(), sc.set(1, hgt, 1)); trunk.setMatrixAt(n, m4);
      q.setFromEuler(new THREE.Euler(RT() * 3, RT() * 3, 0));
      m4.compose(ps.set(x, y + hgt + cr * 0.7, z), q, sc.set(cr, cr * 1.15, cr)); crown.setMatrixAt(n, m4);
      n++;
    }
    trunk.count = crown.count = n;
    arch.add(trunk, crown);
  }
  // edificio: 4 piani con solai bianchi, fasce vetrate, lamelle, pareti interne; tetto con parapetto
  const GY = groundAt(BLD.x, BLD.z);
  const bld = group(arch, BLD.x, GY, BLD.z);
  const FH = 0.14, NF = 4;
  const floors = [];
  for (let i = 0; i < NF; i++) {
    const f = group(bld, 0, i * FH, 0);
    const sx = i === 2 ? 0.09 : 0;             // volume a sbalzo al secondo piano
    f.userData.sx = sx;
    add(f, rbox(BLD.w + (i === 2 ? 0.1 : 0), 0.026, BLD.d, 0.006, 2), M.white, sx * 0.5, 0.013, 0);
    const iw = BLD.w - 0.05 + (i === 2 ? 0.1 : 0), id = BLD.d - 0.05, ih = FH - 0.026;
    const gl = add(f, new THREE.BoxGeometry(iw, ih, id), M.glass, sx * 0.5, 0.026 + ih / 2, 0);
    gl.renderOrder = 2;
    // nucleo scale/ascensori e pareti interne
    add(f, rbox(0.17, ih, 0.15, 0.004, 2), M.whiteSoft, -0.14 + sx * 0.5, 0.026 + ih / 2, -0.06);
    add(f, new THREE.BoxGeometry(0.006, ih, id * 0.62), M.whiteSoft, 0.08 + sx * 0.5, 0.026 + ih / 2, 0.06);
    add(f, new THREE.BoxGeometry(iw * 0.34, ih, 0.006), M.whiteSoft, 0.24 + sx * 0.5, 0.026 + ih / 2, -0.08);
    // lamelle verticali sulla facciata lunga (davanti e dietro)
    const nFin = 14, fin = new THREE.BoxGeometry(0.007, ih, 0.022);
    const fins = new THREE.InstancedMesh(fin, M.white, nFin * 2);
    const m4 = new THREE.Matrix4();
    for (let j = 0; j < nFin; j++) {
      const x = -iw / 2 + 0.02 + (j / (nFin - 1)) * (iw - 0.04) + sx * 0.5;
      m4.makeTranslation(x, 0.026 + ih / 2, id / 2 + 0.012); fins.setMatrixAt(j, m4);
      m4.makeTranslation(x, 0.026 + ih / 2, -id / 2 - 0.012); fins.setMatrixAt(nFin + j, m4);
    }
    if (i > 0) f.add(fins);
    floors.push(f);
  }
  const roof = group(bld, 0, NF * FH, 0);
  add(roof, rbox(BLD.w + 0.02, 0.032, BLD.d + 0.02, 0.006, 2), M.white, 0, 0.016, 0);
  add(roof, rbox(BLD.w + 0.02, 0.03, 0.012, 0.004, 2), M.white, 0, 0.047, BLD.d / 2 + 0.004);
  add(roof, rbox(BLD.w + 0.02, 0.03, 0.012, 0.004, 2), M.white, 0, 0.047, -BLD.d / 2 - 0.004);
  add(roof, rbox(0.2, 0.05, 0.16, 0.006, 2), M.whiteSoft, -0.14, 0.057, -0.06);
  add(roof, rbox(0.16, 0.008, 0.12, 0.003, 2), mat.glass({ opacity: 0.35 }), 0.16, 0.036, 0.06);
  const fit2A = fitOf(scene, [arch]);
  const fit2B = fitOf(scene, [], boxPts(arch, -BW / 2, BW / 2, 0, GY + NF * FH + 0.06 + NF * 0.22, -BD / 2, BD / 2));
  const archPool = floorPlate(H2, 4.4, 3.4, -0.004, poolTex);
  const archShade = floorPlate(H2, 3.2, 2.4, -0.002, shTex, 0.95);

  /* =====================================================================
     OGGETTO 3 · VASO PARAMETRICO IN FILO SETA (verde bambù → oro)
     ===================================================================== */
  const H3Y = -6.4;
  const H3 = group(scene, 0, H3Y, 0);
  const vaseRoot = group(H3);
  const VH = 1.25, THK = 0.016, NB = 12;
  const NU = small ? 96 : 168, NR = small ? 5 : 8;
  // piedistallo girevole grafite con filo oro
  add(vaseRoot, roundCyl(0.62, 0.07, 0.02, 96), M.graphite, 0, -0.035, 0);
  add(vaseRoot, roundCyl(0.625, 0.006, 0.003, 96), M.goldSatin, 0, -0.004, 0);
  const vase = group(vaseRoot, 0, 0.004, 0);
  /* tre forme: vaso panciuto a costole, paralume a campana ritorto, scultura a cinque lobi */
  const FORMS = [
    { base: (v) => 0.3 + 0.12 * Math.sin(Math.PI * (v * 0.82 + 0.12)) - 0.07 * v + 0.05 * Math.pow(v, 6), n: 18, amp: 0.045, tw: 0.8 },
    { base: (v) => 0.17 + 0.36 * Math.pow(v, 0.72) - 0.04 * Math.sin(Math.PI * v), n: 11, amp: 0.075, tw: 2.1 },
    { base: (v) => 0.25 + 0.1 * Math.cos(TAU * v * 0.95) + 0.035 * Math.cos(3 * TAU * v), n: 5, amp: 0.17, tw: 2.9 }
  ];
  const wF = [1, 0, 0];
  const radius = (th, v) => {
    let r = 0;
    for (let f = 0; f < 3; f++) {
      if (wF[f] < 1e-4) continue;
      const F = FORMS[f];
      r += wF[f] * F.base(v) * (1 + F.amp * Math.cos(F.n * (th + F.tw * v)));
    }
    return r;
  };
  const silkTop = new THREE.Color(0xe7c177), silkBot = new THREE.Color(0x8fae5c), cTmp = new THREE.Color();
  const growU = { uGrow: { value: 9 } };
  const silkMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, metalness: 0.5, roughness: 0.27, clearcoat: 0.6, clearcoatRoughness: 0.18,
    sheen: 1, sheenColor: new THREE.Color(0xfff1c8), sheenRoughness: 0.35, envMapIntensity: 1.25,
    bumpMap: stripes(16, '#6a6a6a', '#ffffff'), bumpScale: 0.55
  });
  silkMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrow = growU.uGrow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aV;\nvarying float vV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvV = aV;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGrow;\nvarying float vV;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vV > uGrow) discard;\nfloat hot = 1.0 - smoothstep(0.0, 0.03, uGrow - vV);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.82, 0.5), hot * 0.8);\ntotalEmissiveRadiance += vec3(1.0, 0.7, 0.3) * hot * hot * 1.8;');
  };
  silkMat.customProgramCacheKey = () => 'tv-silk';
  /* anelli-strato: ogni fascia ha superficie esterna, interna e i due bordi (il fondo chiude la prima) */
  const bands = [];
  for (let b = 0; b < NB; b++) {
    const v0 = b / NB, v1 = (b + 1) / NB;
    const nRow = NR + 1, nCol = NU + 1;
    const count = nRow * nCol * 2 + nCol * 4 + (b === 0 ? nCol + 1 : 0);
    const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 3), av = new Float32Array(count);
    const idx = [];
    const grid = (o, flip) => {
      for (let i = 0; i < NR; i++) for (let j = 0; j < NU; j++) {
        const a = o + i * nCol + j, c = a + nCol;
        if (flip) idx.push(a, a + 1, c, a + 1, c + 1, c); else idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    };
    grid(0, false); grid(nRow * nCol, true);
    const rimO = nRow * nCol * 2;
    const strip = (o, flip) => { for (let j = 0; j < NU; j++) { const a = o + j, c = a + nCol; if (flip) idx.push(a, c, a + 1, a + 1, c, c + 1); else idx.push(a, a + 1, c, a + 1, c + 1, c); } };
    strip(rimO, false); strip(rimO + nCol * 2, true);
    if (b === 0) { const cO = rimO + nCol * 4; for (let j = 0; j < NU; j++) idx.push(cO + nCol, cO + j, cO + j + 1); }   // fondo
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aV', new THREE.BufferAttribute(av, 1));
    geo.setIndex(idx);
    const g = group(vase);
    const m = add(g, geo, silkMat);
    m.frustumCulled = false;
    bands.push({ g, geo, v0, v1, nRow, nCol, rimO });
  }
  let formKey = '';
  const buildVase = () => {
    const key = wF.map((x) => x.toFixed(4)).join(',');
    if (key === formKey) return;
    formKey = key;
    for (const B of bands) {
      const { geo, v0, v1, nRow, nCol, rimO } = B;
      const pos = geo.attributes.position.array, uv = geo.attributes.uv.array, col = geo.attributes.color.array, av = geo.attributes.aV.array;
      const put = (q, x, y, z, u, vv) => {
        pos[q * 3] = x; pos[q * 3 + 1] = y; pos[q * 3 + 2] = z;
        uv[q * 2] = u; uv[q * 2 + 1] = y * 4.5;
        cTmp.copy(silkBot).lerp(silkTop, smoothstep(vv * 1.05 - 0.05));
        col[q * 3] = cTmp.r; col[q * 3 + 1] = cTmp.g; col[q * 3 + 2] = cTmp.b;
        av[q] = vv;
      };
      for (let i = 0; i < nRow; i++) {
        const v = lerp(v0, v1, i / (nRow - 1)), y = v * VH;
        for (let j = 0; j < nCol; j++) {
          const th = (j / (nCol - 1)) * TAU, r = radius(th, v), c = Math.cos(th), s = Math.sin(th);
          put(i * nCol + j, c * r, y, s * r, j / (nCol - 1), v);
          put(nRow * nCol + i * nCol + j, c * (r - THK), y, s * (r - THK), j / (nCol - 1), v);
        }
      }
      [v0, v1].forEach((v, e) => {
        const y = v * VH;
        for (let j = 0; j < nCol; j++) {
          const th = (j / (nCol - 1)) * TAU, r = radius(th, v), c = Math.cos(th), s = Math.sin(th);
          put(rimO + e * nCol * 2 + j, c * r, y, s * r, j / (nCol - 1), v);
          put(rimO + e * nCol * 2 + nCol + j, c * (r - THK), y, s * (r - THK), j / (nCol - 1), v);
        }
      });
      if (v0 === 0) {
        const cO = rimO + nCol * 4;
        for (let j = 0; j < nCol; j++) { const th = (j / (nCol - 1)) * TAU, r = radius(th, 0); put(cO + j, Math.cos(th) * r, 0, Math.sin(th) * r, j / (nCol - 1), 0); }
        put(cO + nCol, 0, 0, 0, 0.5, 0);
      }
      geo.attributes.position.needsUpdate = geo.attributes.uv.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aV.needsUpdate = true;
      geo.computeVertexNormals();
    }
  };
  buildVase();
  const fit3A = fitOf(scene, [], boxPts(vaseRoot, -0.66, 0.66, -0.07, VH + 0.02, -0.66, 0.66));
  const fit3B = fitOf(scene, [], boxPts(vaseRoot, -0.66, 0.66, -0.07, VH + 0.02 + (NB - 1) * 0.105, -0.66, 0.66));
  const vasePool = floorPlate(H3, 3.4, 3.4, -0.07, poolTex);
  const vaseShade = floorPlate(H3, 2.0, 2.0, -0.068, shTex, 0.85);
  const glowTex = radialTexture([[0, 'rgba(255,205,125,0.9)'], [0.35, 'rgba(255,180,90,0.32)'], [1, 'rgba(255,160,70,0)']]);
  const printGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0, blending: THREE.AdditiveBlending }));
  printGlow.scale.set(1.5, 0.5, 1);
  vaseRoot.add(printGlow);

  /* ---------- etichette ---------- */
  const callouts = [...(ctx.overlay?.querySelectorAll('.callout[data-part]') || [])];
  const anchors = {
    housing: [housA, V(0.3, 0.5, -0.3)],
    gears: [planets[1], V(0.1, 0.12, -0.065)],
    shaft: [carG, V(0.08, 0.04, 0.9)],
    bearings: [bearAG, V(0.1, 0.1, -0.455)],
    screws: [screws[0], V(0, 0.03, 0.215)],
    floors: [floors[2], V(0.44, 0.013, BLD.d / 2)],
    facade: [floors[1], V(-0.1, 0.08, BLD.d / 2 + 0.02)],
    site: [siteG, V(-0.7, 0.2, 0.62)]
  };

  /* ---------- camera ---------- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const framer = makeFramer();
  const vA = framer.mkView(), vB = framer.mkView(), vH = [framer.mkView(), framer.mkView(), framer.mkView()], vF = framer.mkView();
  const tmp = V(), tgt = V();

  function update(state) {
    const { p, t, w, h, aspect } = state;
    const idle = ctx.reduceMotion ? 0 : 1;
    const px = ctx.reduceMotion ? 0 : state.pointer.x;
    const desk = smoothstep((aspect - 0.85) / 0.2);
    const E = (a, b) => easeInOutCubic(seg(p, a, b));
    const w2 = smoothstep(seg(p, T.x12A, T.x12B)), w3 = smoothstep(seg(p, T.x23A, T.x23B));
    H1.visible = w2 < 0.999;
    H2.visible = w2 > 0.001 && w3 < 0.999;
    H3.visible = w3 > 0.001;

    /* ================= 1 · riduttore ================= */
    let ex1 = 0;
    if (H1.visible) {
      const re = E(REA, REB);
      for (const [name, [a, b, off]] of Object.entries(GX)) {
        const k = E(a, b) * (1 - re);
        PART[name].position.z = gbBase.get(PART[name]) + off * k;
        ex1 = Math.max(ex1, k);
      }
      screws.forEach((s, j) => { s.position.z = 0.12 * E(0.12 + j * 0.008, 0.2 + j * 0.004) * (1 - re) * (j % 2 ? 1 : 0.6); });
      /* rotismo: corona ferma, portasatelliti c, sole c(1 + ZR/ZS), satelliti dall'ingranamento col sole */
      const c = p * 7.5 + (idle ? t * 0.06 : 0);
      const ts = c * (1 + ZR / ZS);
      sunG.rotation.z = ts;
      carG.rotation.z = c;
      planets.forEach((g, i) => {
        const ci = c + (i * TAU) / 3;
        g.position.set(Math.cos(ci) * ARM, Math.sin(ci) * ARM, 0);
        g.rotation.z = ci + Math.PI - (TAU / ZP) * (0.5 - ((ci - ts) * ZS) / TAU);
      });
      gbPose.rotation.set(-0.12, 2.42 - 0.22 * seg(p, 0, 0.33) + (idle ? Math.sin(t * 0.35) * 0.04 + px * 0.08 : 0) + w2 * 0.4, 0);
      gbShade.material.opacity = 0.9 * (1 - 0.5 * ex1);
    }

    /* ================= 2 · plastico ================= */
    if (H2.visible) {
      const sp = E(T.sepA, T.sepB) * (1 - E(T.joinA, T.joinB));
      floors.forEach((f, i) => { f.position.y = i * FH + i * 0.2 * sp; });
      roof.position.y = NF * FH + NF * 0.2 * sp;
      arch.rotation.y = -0.62 + 0.36 * seg(p, 0.33, 0.66) + (idle ? Math.sin(t * 0.3) * 0.035 + px * 0.07 : 0) + (1 - w2) * 0.45 - w3 * 0.45;
      archShade.material.opacity = 0.95;
    }

    /* ================= 3 · vaso ================= */
    if (H3.visible) {
      const m1 = E(T.m1A, T.m1B), m2 = E(T.m2A, T.m2B);
      wF[0] = 1 - m1; wF[1] = m1 * (1 - m2); wF[2] = m2;
      buildVase();
      const g = seg(p, T.growA, T.growB);
      growU.uGrow.value = p < T.growA ? -1 : g >= 1 ? 9 : easeInOutCubic(g) * 1.001;
      const printing = g > 0 && g < 1;
      printGlow.material.opacity = printing ? 0.85 * Math.sin(Math.PI * g) + 0.15 : 0;
      printGlow.position.y = easeInOutCubic(g) * VH;
      printGlow.visible = printing;
      const vx = E(T.vxA, T.vxB) * (1 - E(T.vjA, T.vjB));
      bands.forEach((B, b) => {
        B.g.position.y = b * 0.105 * vx;
        B.g.rotation.y = (b - NB / 2) * 0.12 * vx;
      });
      vase.rotation.y = -0.4 + seg(p, 0.66, 1) * 1.6 + (idle ? t * 0.05 : 0);
      vaseRoot.rotation.y = idle ? px * 0.08 : 0;
      vaseShade.material.opacity = 0.85 * seg(p, T.growA, T.growA + 0.02);
    }

    scene.updateMatrixWorld(true);

    /* ================= camera ================= */
    /* sul telefono l'indice 01 02 03 sta in alto: il 3D un po' più in basso e meno alto */
    const offX = lerp(0, 0.225, desk), offY = lerp(0.16, 0, desk);
    camera.setViewOffset(w, h, -offX * w, offY * h, w, h);
    const availH = lerp(0.8, 0.44, desk), availV = lerp(0.36, 0.78, desk);
    const kV = 1 / (tanHalf * availV), kH = 1 / (tanHalf * aspect * availH);
    if (w2 < 1) framer.fitView(fit1, lerp(0.3, 0.4, ex1), kV * 0.97, kH * 0.97, vH[0]);
    if (w2 > 0 && w3 < 1) {
      framer.fitView(fit2A, 0.62, kV * 0.82, kH * 0.82, vA);
      framer.fitView(fit2B, 0.5, kV, kH, vB);
      framer.blendView(vA, vB, E(T.sepA - 0.02, T.sepA + 0.08) * (1 - E(T.joinA, T.joinB)), vH[1]);
    }
    if (w3 > 0) {
      framer.fitView(fit3A, 0.32, kV * 1.06, kH * 1.06, vA);
      framer.fitView(fit3B, 0.28, kV, kH, vB);
      framer.blendView(vA, vB, E(T.vxA - 0.01, T.vxA + 0.03) * (1 - E(T.vjA, T.vjB)), vH[2]);
    }
    if (w2 < 1 && w2 > 0) framer.blendView(vH[0], vH[1], w2, vF);
    else if (w3 > 0 && w3 < 1) framer.blendView(vH[1], vH[2], w3, vF);
    else { const v = w2 >= 1 ? (w3 >= 1 ? vH[2] : vH[1]) : vH[0]; framer.blendView(v, v, 0, vF); }
    tgt.copy(vF.t);
    camera.position.set(tgt.x, tgt.y + Math.sin(vF.el) * vF.d, tgt.z + Math.cos(vF.el) * vF.d);
    camera.lookAt(tgt);
    camera.updateMatrixWorld();

    if (callouts.length) placeCallouts(ctx, callouts, anchors, ctx.project(tgt).x, w, tmp);
  }

  return { scene, camera, update, resize() {} };
}
