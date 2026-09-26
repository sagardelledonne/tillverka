/* Tillverka · forma del logo (tre pezzi uguali ruotati di 120° attorno all'origine).
   Ricostruito dal logo Instagram (@tillverka3d). Coordinate in "spazio SVG" (y verso il basso),
   raggio del logo ~0.95. Ogni pezzo = FACE (faccia piena) + CHANNEL (canale scuro con bordo sottile).
   Il pezzo 0 è quello in basso; il pezzo k si ottiene ruotando di k*120° in senso orario (SVG). */

export const FACE = [
  [-0.895, 0.3525],
  [-0.6, 0.6575],
  [-0.2625, 0.6575],
  [-0.195, 0.59],
  [0.1375, 0.59],
  [0.3375, 0.3825],
  [0.17, 0.1375],
  [0.0, 0.345]
];

export const CHANNEL = [
  [-0.895, 0.34],
  [-0.75, 0.195],
  [-0.2625, 0.195],
  [-0.1875, 0.1325],
  [0.155, 0.1325],
  [-0.005, 0.3375]
];

/* spessore del bordo chiaro attorno al canale, nelle stesse unità */
export const OUTLINE = 0.0175;

/* rotazione del pezzo k attorno all'asse Z in spazio three.js (y verso l'alto): orario = angolo negativo */
export const pieceAngle = (k) => -k * (2 * Math.PI / 3);

/* baricentro approssimato del pezzo 0 (spazio three.js, y in alto): utile per farlo "esplodere" verso l'esterno */
export const PIECE_CENTER = [-0.1634, -0.4641];

/* THREE.Shape in spazio three.js (y verso l'alto) per il pezzo 0 */
export function pieceShapes(THREE) {
  const toShape = (pts) => {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, -y) : s.moveTo(x, -y)));
    s.closePath();
    return s;
  };
  return { face: toShape(FACE), channel: toShape(CHANNEL) };
}
