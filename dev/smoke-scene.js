/* Scena minima di esempio (e di collaudo del core): il logo estruso in argento vivo.
   Apri dev/scene.html?name=smoke */
import * as THREE from 'three';
import { pieceShapes, pieceAngle } from '../assets/js/three/logo-shape.js';
import { mat } from '../assets/js/three/materials.js';
import { seg, easeInOutCubic } from '../assets/js/three/core.js';

export async function create(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 4.2);

  const { face, channel } = pieceShapes(THREE);
  const faceGeo = new THREE.ExtrudeGeometry(face, { depth: 0.22, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3 });
  const chanGeo = new THREE.ExtrudeGeometry(channel, { depth: 0.12, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
  const silver = mat.liquidSilver();
  const dark = mat.graphite();
  const logo = new THREE.Group();
  const pieces = [0, 1, 2].map((k) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(faceGeo, silver));
    const c = new THREE.Mesh(chanGeo, dark);
    c.position.z = 0.16;
    g.add(c);
    g.rotation.z = pieceAngle(k);
    logo.add(g);
    return g;
  });
  scene.add(logo);

  return {
    scene, camera,
    update({ p, t, pointer }) {
      const e = easeInOutCubic(seg(p, 0.2, 0.6));
      pieces.forEach((g, k) => {
        const a = pieceAngle(k) - Math.PI / 2 - 0.35;
        g.position.set(Math.cos(a) * e * 0.6, Math.sin(a) * e * 0.6, e * 0.3 * (k - 1));
      });
      logo.rotation.y = Math.sin(t * 0.4) * 0.35 + pointer.x * 0.3;
      logo.rotation.x = -pointer.y * 0.2;
    }
  };
}
