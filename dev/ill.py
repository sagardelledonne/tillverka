"""Tillverka · disegni tecnici SVG della pagina (SPEC §7.6) e disegni di riserva delle scene 3D.
Genera gli SVG e li inserisce in index.html al posto dei segnaposto <!--ILL:nome--> / <!--FB:nome-->
(tra il segnaposto e <!--/ILL--> / <!--/FB-->, quindi si può rilanciare). Stile: classi .k .s .g .b (tratti),
.fk .fs .fg .fb .fp (riempimenti) di style.css; i tratti dentro <g class="d"> si disegnano quando la sezione entra.
Uso: python dev/ill.py            (scrive index.html)
     python dev/ill.py --preview  (scrive anche dev/ill.html, pagina di controllo con tutti i disegni)"""
import math, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(here, '..', 'index.html')
TAU = math.tau


def f(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def pts_d(pts, close=False):
    d = 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts)
    return d + (' Z' if close else '')


class G:
    """raccoglie elementi con indice di ritardo progressivo per la comparsa"""
    def __init__(self):
        self.out, self.i = [], 0

    def p(self, d, cls, i=None, extra=''):
        if i is None:
            i = self.i; self.i += 1
        self.out.append(f'<path class="{cls}" d="{d}" pathLength="1" style="--i:{i}"{extra}/>')

    def raw(self, s):
        self.out.append(s)

    def s(self):
        return ''.join(self.out)


def ell(cx, cy, rx, ry, part='full'):
    """ellisse: full, front (metà bassa, verso chi guarda), back (metà alta)"""
    if part == 'front':
        return f'M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 0 0 {f(cx + rx)} {f(cy)}'
    if part == 'back':
        return f'M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 0 1 {f(cx + rx)} {f(cy)}'
    return f'M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 0 {f(cx + rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 0 {f(cx - rx)} {f(cy)}'


def smooth(pts):
    """Catmull-Rom → curve di Bézier (path liscio che passa per i punti)"""
    d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(len(pts) - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f' C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
    return d


def fillet(pts, n=8):
    """poligono [(x, y, r)] → punti con spigoli raccordati (Bézier quadratiche, come kit.js)"""
    out, N = [], len(pts)
    for i in range(N):
        x, y, r = pts[i]
        ax, ay = pts[i - 1][:2]; bx, by = pts[(i + 1) % N][:2]
        la, lb = math.hypot(ax - x, ay - y), math.hypot(bx - x, by - y)
        k = min(r, la * 0.98, lb * 0.98)
        if k <= 1e-6:
            out.append((x, y)); continue
        p1 = (x + (ax - x) / la * k, y + (ay - y) / la * k); p2 = (x + (bx - x) / lb * k, y + (by - y) / lb * k)
        for j in range(n + 1):
            t = j / n; u = 1 - t
            out.append((u * u * p1[0] + 2 * u * t * x + t * t * p2[0], u * u * p1[1] + 2 * u * t * y + t * t * p2[1]))
    clean = []
    for p in out:
        if not clean or math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 1e-6:
            clean.append(p)
    return clean


def offset(pts, d):
    """offset verso l'interno (d > 0) di un poligono chiuso liscio"""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    s = 1 if area > 0 else -1
    out = []
    for i in range(n):
        a, p, b = pts[i - 1], pts[i], pts[(i + 1) % n]
        e1 = (p[0] - a[0], p[1] - a[1]); e2 = (b[0] - p[0], b[1] - p[1])
        l1 = math.hypot(*e1) or 1; l2 = math.hypot(*e2) or 1
        n1 = (-e1[1] / l1 * s, e1[0] / l1 * s); n2 = (-e2[1] / l2 * s, e2[0] / l2 * s)
        nx, ny = n1[0] + n2[0], n1[1] + n2[1]; nl = math.hypot(nx, ny) or 1; nx /= nl; ny /= nl
        k = d / max(0.35, nx * n1[0] + ny * n1[1])
        out.append((p[0] + nx * k, p[1] + ny * k))
    return out


def iso(cx, cy, s):
    """proiezione isometrica: x va in basso a destra, z in basso a sinistra, y in alto"""
    return lambda x, y, z: (cx + (x - z) * 0.866 * s, cy + (x + z) * 0.5 * s - y * s)


def iso_box(P, x0, x1, y0, y1, z0, z1):
    """spigoli visibili di un parallelepipedo (vista da +x +z, dall'alto)"""
    t = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]
    top = pts_d(t, True)
    sides = pts_d([P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), P(x0, y1, z1)]) + ' ' + pts_d([P(x1, y0, z1), P(x1, y1, z1)])
    return top, sides


def gear_outline(Z, m, addm=1.0, dedm=1.25, nF=4, cx=0, cy=0, rot=0, scale=1.0):
    """contorno di un ingranaggio a evolvente (come audience-scene.js)"""
    PA = math.radians(20); INV = lambda a: math.tan(a) - a
    r = m * Z / 2; rb = r * math.cos(PA); ra = r + addm * m; rf = r - dedm * m
    half = math.pi / (2 * Z) + INV(PA)
    phi = lambda R: 0 if R <= rb else INV(math.acos(rb / R))
    r0 = max(rf, rb)
    pts = []
    P = lambda R, a: pts.append((cx + math.cos(a + rot) * R * scale, cy + math.sin(a + rot) * R * scale))
    for k in range(Z):
        c = k * TAU / Z
        P(rf, c - math.pi / Z)
        if rb > rf: P(rb, c - half)
        for i in range(1, nF + 1):
            R = r0 + (ra - r0) * i / nF; P(R, c - half + phi(R))
        for i in range(nF, 0, -1):
            R = r0 + (ra - r0) * i / nF; P(R, c + half - phi(R))
        if rb > rf: P(rb, c + half)
    return pts_d(pts, True)


def svg(vb, body, cls='', extra=''):
    return f'<svg viewBox="{vb}"{f" class={chr(34)}{cls}{chr(34)}" if cls else ""}{extra} aria-hidden="true">{body}</svg>'


# ---------------------------------------------------------------- servizi
def ill_scan():
    """scansione: un vaso su un piatto girevole; sopra la linea laser è ancora solido, sotto è nuvola di punti"""
    cx = 200
    prof = [(238, 36), (228, 45), (196, 60), (158, 57), (124, 38), (98, 25), (76, 28), (62, 31)]
    ys = [p[0] for p in prof]

    def r_at(y):
        for (y0, r0), (y1, r1) in zip(prof, prof[1:]):
            if y1 <= y <= y0:
                t = (y0 - y) / (y0 - y1); t = t * t * (3 - 2 * t)
                return r0 + (r1 - r0) * t
        return prof[-1][1]
    left = [(cx - r, y) for y, r in prof]; right = [(cx + r, y) for y, r in prof]
    sil = smooth(left) + ' ' + smooth(right)
    body_fill = smooth(left) + ' L' + ' L'.join(f'{f(x)} {f(y)}' for x, y in [(cx + prof[-1][1], prof[-1][0])]) + ' ' + smooth(right[::-1])[1:].replace('M', 'L', 1) + ' Z'
    g = G()
    # nuvola di punti (sempre sotto)
    dots = []
    for y in range(66, 238, 7):
        r = r_at(y)
        n = max(6, int(r / 3.2))
        for j in range(n + 1):
            th = math.pi * (j + 0.5 * (y % 2)) / n
            x = cx - r * math.cos(th); yy = y + r * 0.2 * math.sin(th)
            dots.append(f'<circle class="{"fg" if (j + y) % 3 else "fk"}" cx="{f(x)}" cy="{f(yy)}" r="{1.05 if (j + y) % 3 else 0.8}"/>')
    cloud = f'<g class="f" style="--i:3" opacity=".85">{"".join(dots)}</g>'
    # piatto girevole
    g.p(ell(cx, 246, 84, 17), 'k')
    g.p(ell(cx, 246, 72, 13.5), 's')
    g.p(f'M{cx - 84} 246 v7 ' + ell(cx, 253, 84, 17, 'front')[len(f'M{f(cx - 84)} 253'):] + ' v-7', 'k')
    # vaso solido (sopra la linea)
    rings = ''.join(f'<path class="s" d="{ell(cx, y, r_at(y), r_at(y) * 0.2, "front")}"/>' for y in (86, 118, 150, 182, 214))
    solid = (f'<g class="scan-solid"><path class="fp" d="{body_fill}"/>{rings}'
             f'<path class="k" d="{sil}"/><path class="k" d="{ell(cx, 62, 31, 6.2)}"/><path class="s" d="{ell(cx, 64, 25, 4.6, "back")}"/>'
             f'<path class="k" d="{ell(cx, 238, 36, 7.2, "front")}"/></g>')
    # scanner a mano e ventaglio di luce
    fan = G(); fan.i = 5
    for ty in (96, 150, 206):
        fan.p(f'M314 90 L{f(cx + r_at(ty) + 2)} {ty}', 'g dash')
    scanner = ('<g class="f" style="--i:6" transform="translate(334 76) rotate(-24)">'
               '<rect class="fp" x="-36" y="-15" width="72" height="30" rx="9"/><rect class="k" x="-36" y="-15" width="72" height="30" rx="9" fill="none"/>'
               '<circle class="k" cx="-20" cy="0" r="7"/><circle class="k" cx="18" cy="0" r="7"/><circle class="fg" cx="-1" cy="0" r="2.4"/>'
               '<path class="k" d="M-10 15 l4 34 h14 l4 -34"/></g>')
    g.p(f'M{cx - 118} 272 H{cx + 118}', 's')
    body = f'<g class="d">{g.s()}</g>{cloud}{solid}<g class="d">{fan.s()}</g>{scanner}'
    return svg('0 0 400 300', body) + '<span class="scan-line" aria-hidden="true"></span>'


PLAN = [(0, 0, 0.26), (1.9, 0, 0.31), (1.9, 0.62, 0.31), (0.62, 0.62, 0.22), (0.62, 1.5, 0.31), (0, 1.5, 0.31)]
HOLES = [(1.59, 0.31, 0.12), (0.31, 1.19, 0.12), (0.31, 0.31, 0.15)]


def plate_lines(P, outline, y0, y1, g, cls_top='k', cls_hid='s dash', holes=(), top=True):
    """lastra in pianta: contorno sopra, spigoli sotto (visibili o nascosti), spigoli verticali di sagoma"""
    n = len(outline)
    area = sum(outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1] for i in range(n))
    s = 1 if area > 0 else -1
    vis = []
    for i in range(n):
        a, b = outline[i], outline[(i + 1) % n]
        nx, nz = (b[1] - a[1]) * s, -(b[0] - a[0]) * s          # normale esterna in pianta
        vis.append(nx + nz > 1e-9)
    if top:
        g.p(pts_d([P(x, y1, z) for x, z in outline], True), cls_top)
    # spigoli bassi: raggruppa i tratti visibili e nascosti
    i0 = 0
    while i0 < n and vis[i0] == vis[-1]:
        i0 += 1
    i0 %= n
    run, cur = [], None
    for k in range(n + 1):
        i = (i0 + k) % n
        if cur is None:
            cur = vis[i]; run = [outline[i]]
        if vis[i] != cur or k == n:
            run.append(outline[i])
            g.p(pts_d([P(x, y0, z) for x, z in run]), 'k' if cur else cls_hid)
            if cur is not None and k < n:
                x, z = outline[i]; g.p(pts_d([P(x, y0, z), P(x, y1, z)]), 'k')
            cur = vis[i]; run = [outline[i]]
        else:
            run.append(outline[(i + 1) % n])
    for hx, hz, hr in holes:
        c = [(hx + math.cos(a) * hr, hz + math.sin(a) * hr) for a in [j * TAU / 48 for j in range(49)]]
        g.p(pts_d([P(x, y1, z) for x, z in c]), 'k')
        back = [(hx + math.cos(a) * hr, hz + math.sin(a) * hr) for a in [math.pi * 0.75 + j * math.pi / 24 for j in range(25)]]
        g.p(pts_d([P(x, y0, z) for x, z in back]), 's')


def ill_model():
    """modellazione: la staffa in CAD, spigoli nascosti tratteggiati, quote oro, maniglie selezionate"""
    P = iso(172, 90, 90)
    out = fillet([(x, z, r) for x, z, r in PLAN], 8)
    g = G()
    plate_lines(P, out, 0, 0.34, g, holes=HOLES)
    q = G(); q.i = g.i
    # quota lunghezza lungo z = -0.3
    a, b = P(0, 0, -0.32), P(1.9, 0, -0.32)
    q.p(pts_d([P(0, 0, -0.06), P(0, 0, -0.4)]) + ' ' + pts_d([P(1.9, 0, -0.06), P(1.9, 0, -0.4)]), 's')
    q.p(pts_d([a, b]), 'g')
    tick = lambda p: f'M{f(p[0] - 3)} {f(p[1] + 3)} L{f(p[0] + 3)} {f(p[1] - 3)}'
    q.p(tick(a) + ' ' + tick(b), 'g')
    m = P(0.95, 0, -0.4)
    txt = f'<text class="tg" x="{f(m[0] + 4)}" y="{f(m[1] - 4)}">48</text>'
    # spessore sul fianco destro
    t0, t1 = P(2.25, 0, 0.62), P(2.25, 0.34, 0.62)
    q.p(pts_d([P(1.95, 0, 0.62), P(2.32, 0, 0.62)]) + ' ' + pts_d([P(1.95, 0.34, 0.62), P(2.32, 0.34, 0.62)]), 's')
    q.p(pts_d([t0, t1]), 'g')
    q.p(tick(t0) + ' ' + tick(t1), 'g')
    txt += f'<text class="tg" x="{f(t0[0] + 7)}" y="{f((t0[1] + t1[1]) / 2 + 3)}">9</text>'
    # foro e raggio interno con richiami
    h = P(1.59, 0.34, 0.31)
    q.p(f'M{f(h[0] + 10)} {f(h[1] - 5)} l22 -26 h26', 'g')
    txt += f'<text class="tg" x="{f(h[0] + 36)}" y="{f(h[1] - 35)}">Ø 6</text>'
    rc = P(0.72, 0.34, 0.72)
    q.p(f'M{f(rc[0])} {f(rc[1])} l28 22 h24', 'g')
    txt += f'<text class="tg" x="{f(rc[0] + 32)}" y="{f(rc[1] + 18)}">R 5</text>'
    picks = ''.join(f'<rect class="fg pick" x="{f(x - 2.6)}" y="{f(y - 2.6)}" width="5.2" height="5.2" style="animation-delay:{d}s"/>'
                    for (x, y), d in zip([P(1.9, 0.34, 0.31), P(0.62, 0.34, 1.5), P(0, 0.34, 0.0)], (0, 0.8, 1.6)))
    axes = ('<g class="f" style="--i:9" transform="translate(40 262)"><path class="g" d="M0 0 l18 10"/><path class="b" d="M0 0 v-20"/>'
            '<path class="k" d="M0 0 l-18 10"/><text x="21" y="16">x</text><text x="-4" y="-24">y</text><text x="-28" y="16">z</text></g>')
    return svg('0 0 400 300', f'<g class="d">{g.s()}{q.s()}</g><g class="f" style="--i:8">{txt}{picks}</g>{axes}')


def ill_print():
    """stampa: strati visti di lato, l'ugello stende lo strato in cima (oro) e torna"""
    g = G()
    g.p('M56 252 H344 V260 H56 Z', 'k')
    g.p('M72 260 v8 M328 260 v8', 'k')
    layers = []
    y = 244
    i = 0
    while y > 150:
        t = (244 - y) / 94
        half = 64 + 18 * math.sin(math.pi * t * 0.9) - 8 * t
        layers.append(f'<rect class="k" x="{f(200 - half)}" y="{f(y)}" width="{f(half * 2)}" height="6.4" rx="3.2" fill="none" pathLength="1" style="--i:{2 + i // 3}"/>')
        y -= 7; i += 1
    top_y = y + 7
    fresh = f'<rect class="fg fresh" x="142" y="{f(top_y - 6.6)}" width="118" height="6.2" rx="3.1" style="transform-origin:142px {f(top_y - 3.5)}px"/>'
    tip_y = top_y - 7
    noz = (f'<g class="nozzle-g">'
           f'<circle class="fg" cx="260" cy="{f(tip_y)}" r="7" opacity=".28"/>'
           f'<path class="fg" d="M252 {f(tip_y - 12)} h16 l-5 11 h-6 Z"/>'
           f'<rect class="fp" x="236" y="{f(tip_y - 38)}" width="46" height="26" rx="4"/><rect class="k" x="236" y="{f(tip_y - 38)}" width="46" height="26" rx="4" fill="none"/>'
           f'<circle class="k" cx="248" cy="{f(tip_y - 25)}" r="5"/>'
           f'<path class="k" d="M254 {f(tip_y - 38)} v-18 h12 v18"/>'
           f'<rect class="fp" x="238" y="{f(tip_y - 98)}" width="44" height="42" rx="3"/><rect class="k" x="238" y="{f(tip_y - 98)}" width="44" height="42" rx="3" fill="none"/>'
           + ''.join(f'<path class="s" d="M238 {f(tip_y - 92 + k * 6)} h44"/>' for k in range(6)) +
           f'<path class="b" d="M260 {f(tip_y - 98)} V14" style="stroke-width:2.2"/></g>')
    return svg('0 0 400 300', f'<g class="d">{g.s()}{"".join(layers)}</g><g class="f" style="--i:6">{fresh}{noz}</g>')


# ---------------------------------------------------------------- altezza di strato
def ill_lh(n):
    """la stessa curva (quarto di ellisse) con n strati: 32 = 0,05 mm, 16 = 0,1 mm, 8 = 0,2 mm"""
    x0, x1, yb, yt = 28, 272, 184, 28
    H = yb - yt
    xc = lambda y: x1 - (x1 - x0) * math.cos(math.asin(min(1, (yb - y) / H)))
    h = H / n
    pts = [(x1, yb)]
    for i in range(n):
        ymid = yb - (i + 0.5) * h
        x = xc(ymid)
        pts += [(x, yb - i * h), (x, yb - (i + 1) * h)]
    pts.append((x1, yt))
    stair = pts_d(pts, True)
    curve = [(xc(yb - H * k / 60), yb - H * k / 60) for k in range(61)]
    body = (f'<path class="s" d="M{x0 - 12} {yb} H{x1 + 12}" /><g class="stack"><path class="fs" d="{stair}" opacity=".16"/>'
            f'<path class="k" d="{stair}"/></g><path class="g dash" d="{pts_d(curve)}"/>')
    return svg('0 0 300 200', body)


# ---------------------------------------------------------------- come funziona
def ill_how(k):
    g = G()
    extra = ''
    if k == 1:   # idea o file: schizzo su un foglio, matita, file
        extra += '<path class="fp" d="M31 29 L151 18 L160 121 L40 132 Z"/>'
        g.p('M31 29 L151 18 L160 121 L40 132 Z', 'k')
        g.p(smooth([(74, 110), (70, 92), (80, 74), (74, 58), (78, 44)]) + ' ' + smooth([(112, 106), (116, 90), (106, 74), (110, 58), (104, 44)]), 's')
        g.p('M78 44 C86 40 98 40 104 44 M74 110 C86 116 100 114 112 106', 's')
        g.p('M120 118 L176 62 L186 72 L130 128 Z M120 118 L116 132 L130 128', 'k')
        g.p('M170 68 l10 10', 's')
        g.p('M184 22 h30 l12 12 v48 h-42 Z M214 22 v12 h12', 'k')
        extra += '<text class="tk" x="191" y="66">STL</text>'
    elif k == 2:  # modello: monitor con la staffa in fil di ferro
        g.p('M36 14 H204 Q212 14 212 22 V112 Q212 120 204 120 H36 Q28 120 28 112 V22 Q28 14 36 14 Z', 'k')
        g.p('M36 22 H204 V104 H36 Z', 's')
        g.p('M108 120 L102 138 H138 L132 120 M92 140 H148', 'k')
        P = iso(100, 50, 26)
        out = fillet([(x, z, r) for x, z, r in PLAN], 5)
        g.p(pts_d([P(x, 0.34, z) for x, z in out], True), 'g')
        g.p(pts_d([P(x, 0, z) for x, z in out], True), 'g dash')
        for x, z in ((1.9, 0.31), (0, 0), (0.62, 1.5), (1.9, 0)):
            a, b = P(x, 0, z), P(x, 0.34, z); g.p(pts_d([a, b]), 'g')
        g.p('M176 84 l0 16 l4 -4 l4 8 l3 -1.5 l-4 -8 l6 0 Z', 'k')
    elif k == 3:  # stampa: stampante chiusa
        g.p('M64 12 H176 Q184 12 184 20 V132 Q184 140 176 140 H64 Q56 140 56 132 V20 Q56 12 64 12 Z', 'k')
        g.p('M66 40 H174 M66 122 H174', 's')
        g.p('M124 40 v10 h-8 v12 h16 v-12 h-8 M120 62 h8 l-4 6 Z', 'k')
        for i, w in enumerate((56, 52, 50, 50, 46)):
            y = 116 - i * 7
            g.p(f'M{120 - w / 2} {y} h{w}', 'k' if i < 4 else 'g')
        extra += '<circle class="fg" cx="124" cy="71" r="4" opacity=".4"/>'
    else:          # finitura e consegna: scatola aperta con il pezzo e spunta
        P = iso(112, 70, 44)
        t, s_ = iso_box(P, 0, 1.2, 0, 0.8, 0, 1.0)
        g.p(t, 'k'); g.p(s_, 'k')
        c = P(0.6, 0.8, 0.5)
        g.p(smooth([(c[0] - 12, c[1] + 2), (c[0] - 16, c[1] - 14), (c[0] - 9, c[1] - 28), (c[0] - 11, c[1] - 38)]) + ' ' +
            smooth([(c[0] + 12, c[1] + 2), (c[0] + 16, c[1] - 14), (c[0] + 9, c[1] - 28), (c[0] + 11, c[1] - 38)]), 'g')
        g.p(ell(c[0], c[1] - 38, 11, 3), 'g')
        g.p(ell(196, 34, 16, 16), 'b')
        g.p('M188 34 l6 6 l11 -12', 'b')
    return svg('0 0 240 150', f'{extra}<g class="d">{g.s()}</g>')


# ---------------------------------------------------------------- riserve delle scene 3D
def fb_anatomy():
    P0 = iso(265, 246, 90)
    out = fillet([(x, z, r) for x, z, r in PLAN], 8)
    g = G()
    levels = [(2.3, 'top'), (1.55, 'walls'), (0.8, 'infill'), (0.0, 'bottom')]
    clips = ''
    for idx, (Y, kind) in enumerate(levels):
        P = lambda x, y, z, Y=Y: P0(x, y + Y, z)
        cid = f'fba{idx}'
        clips += f'<clipPath id="{cid}"><path d="{pts_d([P(x, 0.3, z) for x, z in out], True)}"/></clipPath>'
        if kind in ('top', 'bottom'):
            plate_lines(P, out, 0, 0.12, g, holes=HOLES)
            ang = 1 if kind == 'top' else -1
            lines = ' '.join(pts_d([P(-2 + k * 0.09, 0.12, -1), P(-2 + k * 0.09 + 3 * ang, 0.12, 2)]) for k in range(0, 72))
            g.raw(f'<g clip-path="url(#{cid})"><path class="s" d="{lines}" opacity=".7"/></g>')
        elif kind == 'walls':
            plate_lines(P, out, 0, 0.3, g)
            for d in (0.05, 0.1):
                g.p(pts_d([P(x, 0.3, z) for x, z in offset(out, d)], True), 's')
        else:
            g.p(pts_d([P(x, 0.3, z) for x, z in offset(out, 0.14)], True), 's')
            waves = []
            for k in range(-6, 40):
                row = []
                for j in range(0, 81):
                    u = j / 80 * 3.2
                    x = u; z = k * 0.07 + 0.05 * math.sin(u * 14 + k)
                    row.append(P(x, 0.3, z))
                waves.append(pts_d(row))
            g.raw(f'<g clip-path="url(#{cid})"><path class="g" d="{" ".join(waves)}" opacity=".75"/></g>')
    for x, z in ((0, 0), (1.9, 0.31), (0.31, 1.5)):
        g.p(pts_d([P0(x, 0.12, z), P0(x, 2.3, z)]), 's dash')
    # supporto ad albero
    b = P0(1.3, -0.5, 1.1)
    g.p(f'M{f(b[0])} {f(b[1])} v-34 M{f(b[0])} {f(b[1] - 34)} l-22 -26 M{f(b[0])} {f(b[1] - 34)} l20 -28 M{f(b[0])} {f(b[1] - 34)} l2 -32 M{f(b[0] - 26)} {f(b[1] + 2)} h52', 'b')
    return svg('0 0 600 480', f'<defs>{clips}</defs>{g.s()}')


def fb_tech():
    out = []
    # 0 · hotend esploso
    g = G(); cx = 280
    g.p(f'M{cx} 20 V410', 's dash')
    g.p(f'M{cx - 55} 60 h110 v108 h-110 Z', 'k')
    for k in range(9):
        g.p(f'M{cx - 55} {70 + k * 11} h110', 's')
    g.p(f'M{cx - 12} 196 h24 v56 h-24 Z M{cx - 12} 212 h24 M{cx - 12} 236 h24', 'k')
    g.p(f'M{cx - 70} 282 h120 v52 h-120 Z', 'k')
    g.p(ell(cx - 38, 308, 13, 13), 'k'); g.p(ell(cx + 22, 316, 5, 5), 'k')
    g.p(f'M{cx - 38} 308 h-80 M{cx + 22} 316 h60', 's')
    g.p(f'M{cx - 22} 362 h44 l-6 12 h-32 Z M{cx - 10} 374 L{cx} 396 L{cx + 10} 374', 'g')
    g.p(f'M{cx} 20 V58', 'b')
    out.append(svg('0 0 560 420', g.s(), extra=' data-seg="0"'))
    # 1 · stampante a resina esplosa
    g = G(); P = iso(280, 150, 120)
    for (y0, y1, cls) in ((-1.2, -0.95, 'k'), (-0.62, -0.58, 'k'), (-0.2, -0.16, 'g'), (0.2, 0.36, 'k')):
        t, s_ = iso_box(P, -0.45, 0.45, y0, y1, -0.35, 0.35)
        g.p(t, cls); g.p(s_, cls)
    for i in range(6):
        for j in range(5):
            x, y = P(-0.32 + i * 0.13, -0.58, -0.25 + j * 0.125)
            g.raw(f'<circle class="fs" cx="{f(x)}" cy="{f(y)}" r="2.2"/>')
    t, s_ = iso_box(P, -0.4, 0.4, 0.72, 1.3, -0.32, 0.32); g.p(t, 'g'); g.p(s_, 'g')
    g.p(pts_d([P(0.05, -0.16, -0.05), P(0.18, -0.16, 0.0), P(0.12, -0.16, 0.14), P(-0.04, -0.16, 0.1)], True), 'g')
    out.append(svg('0 0 560 420', g.s(), extra=' data-seg="1"'))
    # 2 · nylon: blocco di polvere e pezzi
    g = G(); P = iso(250, 250, 120)
    t, s_ = iso_box(P, -0.55, 0.55, 0, 0.5, -0.4, 0.4); g.p(t, 'k'); g.p(s_, 'k')
    import random
    rnd = random.Random(4)
    for _ in range(260):
        x, y, z = rnd.uniform(-0.55, 0.55), rnd.uniform(0, 0.5), rnd.uniform(-0.4, 0.4)
        face = rnd.random()
        if face < 0.4: y = 0.5
        elif face < 0.7: z = 0.4
        else: x = 0.55
        px, py = P(x, y, z)
        g.raw(f'<circle class="fs" cx="{f(px)}" cy="{f(py)}" r="1.1"/>')
    g.p(gear_outline(15, 3.6, cx=410, cy=120), 'k'); g.p(ell(410, 120, 8, 8), 'k')
    g.p(ell(220, 110, 44, 44), 'k')
    for k in range(6):
        a = k * TAU / 6
        g.p(f'M{f(220 + math.cos(a) * 44)} {f(110 + math.sin(a) * 44)} L{f(220 + math.cos(a + 2.1) * 44)} {f(110 + math.sin(a + 2.1) * 44)}', 's')
    g.p('M300 60 h20 v50 h40 v18 h-60 Z', 'k')
    out.append(svg('0 0 560 420', g.s(), extra=' data-seg="2"'))
    return ''.join(out)


def fb_audience():
    out = []
    # 0 · rotismo epicicloidale di fronte
    g = G(); cx, cy, s = 280, 210, 285
    m = 0.022
    g.p(ell(cx, cy, 0.7 * s, 0.7 * s), 'k')
    g.p(ell(cx, cy, 0.6 * s, 0.6 * s), 's')
    for j in range(6):
        a = (j + 0.5) * TAU / 6
        g.p(ell(cx + math.cos(a) * 0.655 * s, cy + math.sin(a) * 0.655 * s, 7, 7), 'g')
    g.p(gear_outline(42, m, 1.25, 1.0, cx=cx, cy=cy, scale=s), 'k')
    arm = (12 + 15) * m / 2
    for i in range(3):
        c = i * TAU / 3
        rot = c + math.pi - (TAU / 15) * (0.5 - c * 12 / TAU)
        px, py = cx + math.cos(c) * arm * s, cy + math.sin(c) * arm * s
        g.p(gear_outline(15, m, cx=px, cy=py, rot=rot, scale=s), 'k')
        g.p(ell(px, py, 0.036 * s, 0.036 * s), 's')
    g.p(gear_outline(12, m, cx=cx, cy=cy, scale=s), 'g')
    g.p(ell(cx, cy, 0.05 * s, 0.05 * s), 'g')
    out.append(svg('0 0 560 420', g.s(), extra=' data-seg="0"'))
    # 1 · plastico
    g = G(); P = iso(270, 190, 150)
    t, s_ = iso_box(P, -1.0, 1.0, -0.06, 0.0, -0.72, 0.72); g.p(t, 'k'); g.p(s_, 'k')
    for k in range(1, 6):
        r = 1.1 - k * 0.17
        blob = [(-0.9 + math.cos(a) * r * (1 + 0.1 * math.sin(3 * a + k)), -0.6 + math.sin(a) * r * (1 + 0.1 * math.sin(3 * a + k))) for a in [j * TAU / 64 for j in range(65)]]
        blob = [(max(-1, min(1, x)), max(-0.72, min(0.72, z))) for x, z in blob]
        g.p(pts_d([P(x, k * 0.05, z) for x, z in blob]), 'g' if k % 2 else 's')
    for i in range(4):
        t, s_ = iso_box(P, 0.1, 0.72, 0.02 + i * 0.13, 0.13 + i * 0.13, -0.05, 0.42)
        g.p(t, 'k'); g.p(s_, 'k')
        a, b = P(0.72, 0.06 + i * 0.13, -0.05), P(0.72, 0.06 + i * 0.13, 0.42)
        g.p(pts_d([a, b]), 's')
    for x, z in ((-0.3, 0.45), (-0.55, 0.2), (0.85, 0.55), (-0.1, 0.6), (0.9, -0.5)):
        bx, by = P(x, 0.05, z)
        g.p(f'M{f(bx)} {f(by)} v-14', 'k'); g.p(ell(bx, by - 20, 7, 7), 'b')
    out.append(svg('0 0 560 420', g.s(), extra=' data-seg="1"'))
    # 2 · vaso parametrico
    g = G(); cx = 280
    rad = lambda v: 0.3 + 0.12 * math.sin(math.pi * (v * 0.82 + 0.12)) - 0.07 * v
    Hh, y0, S = 320, 380, 300
    left = [(cx - rad(v) * S, y0 - v * Hh) for v in [k / 30 for k in range(31)]]
    right = [(cx + rad(v) * S, y0 - v * Hh) for v in [k / 30 for k in range(31)]]
    g.p(smooth(left), 'k'); g.p(smooth(right), 'k')
    g.p(ell(cx, y0 - Hh, rad(1) * S, rad(1) * S * 0.2), 'k'); g.p(ell(cx, y0, rad(0) * S, rad(0) * S * 0.2, 'front'), 'k')
    for j in range(14):
        ph = j * TAU / 14
        line = []
        for k in range(41):
            v = k / 40; th = ph + 0.8 * v * TAU / 2
            if math.sin(th) < 0: line.append(None); continue
            line.append((cx - rad(v) * S * math.cos(th), y0 - v * Hh + rad(v) * S * 0.2 * math.sin(th)))
        seg_ = []
        for p in line + [None]:
            if p is None:
                if len(seg_) > 1: g.p(smooth(seg_), 'g' if j % 2 else 'b')
                seg_ = []
            else: seg_.append(p)
    g.p(ell(cx, y0 + 18, 190, 30), 's')
    out.append(svg('0 0 560 420', g.s(), extra=' data-seg="2"'))
    return ''.join(out)


def fb_visor():
    g = G(); cx = 200
    g.p(ell(cx, 96, 130, 30, 'back'), 'b'); g.p(ell(cx, 96, 130, 30, 'front'), 'b')
    g.p(ell(cx, 104, 122, 26, 'front'), 'b')
    for x, y in ((cx - 118, 74), (cx, 50), (cx + 118, 74)):
        g.p(f'M{x - 10} {y - 7} h20 v14 h-20 Z', 'g')
    g.p(f'M{cx - 128} 150 L{cx - 118} 252 Q{cx} 292 {cx + 118} 252 L{cx + 128} 150 Q{cx} 190 {cx - 128} 150 Z', 'k')
    g.p(f'M{cx - 96} 190 L{cx - 90} 246', 's')
    g.p(ell(cx, 128, 150, 36, 'back'), 's dash')
    return svg('0 0 400 300', g.s())


# ---------------------------------------------------------------- inserimento
def build():
    return {
        'ILL:scan': ill_scan(), 'ILL:model': ill_model(), 'ILL:print': ill_print(),
        'ILL:lh005': ill_lh(32), 'ILL:lh01': ill_lh(16), 'ILL:lh02': ill_lh(8),
        'ILL:how1': ill_how(1), 'ILL:how2': ill_how(2), 'ILL:how3': ill_how(3), 'ILL:how4': ill_how(4),
        'FB:anatomy': fb_anatomy(), 'FB:tech': fb_tech(), 'FB:audience': fb_audience(), 'FB:visor': fb_visor()
    }


def inject(html, parts):
    for key, s in parts.items():
        kind = key.split(':')[0]
        pat = re.compile(r'<!--' + re.escape(key) + r'-->(.*?<!--/' + kind + r'-->)?', re.S)
        if not pat.search(html):
            print('manca il segnaposto', key); continue
        html = pat.sub(lambda m: f'<!--{key}-->{s}<!--/{kind}-->', html, count=1)
    # i contenitori delle riserve disegnate usano gli stili .ill
    html = re.sub(r'class="stage-fallback fb-draw( fb-[a-z]+)"', r'class="stage-fallback fb-draw\1 ill"', html)
    return html


if __name__ == '__main__':
    parts = build()
    html = open(INDEX, encoding='utf-8').read()
    open(INDEX, 'w', encoding='utf-8').write(inject(html, parts))
    print('ok', len(parts), 'disegni')
    if '--preview' in sys.argv:
        cells = []
        for key, s in parts.items():
            name = key.split(':')[1]
            if key.startswith('ILL:') and name in ('scan', 'model', 'print'):
                cell = f'<div class="svc reveal is-in"><div class="svc-ill ill ill-{name} is-playing">{s}</div></div>'
            elif name.startswith('lh'):
                cell = f'<div class="reveal is-in"><div class="ill"><figure class="lh-item">{s}</figure></div></div>'
            elif name.startswith('how'):
                cell = f'<div class="reveal is-in"><div class="ill"><div class="how-ill">{s}</div></div></div>'
            else:
                dark = '' if name == 'tech' else ' dark'
                s2 = s.replace('<svg ', '<svg style="width:100%;height:auto;display:block;margin-bottom:8px" ')
                cell = f'<div class="{dark.strip()}" style="padding:10px;border-radius:14px;background:{"#f5f5f7" if not dark else "#050506"}"><div class="ill">{s2}</div></div>'
            cells.append(f'<div><p style="font:12px system-ui;color:#888">{key}</p>{cell}</div>')
        page = ('<!doctype html><html class="js"><head><meta charset="utf-8"><link rel="stylesheet" href="../assets/css/style.css">'
                '<style>body{background:#fff;padding:20px} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-items:start}'
                '.reveal .ill .d > *{stroke-dashoffset:0!important}.reveal .ill .f{opacity:1!important}.lh-item .stack{clip-path:none!important}</style></head>'
                f'<body><div class="grid">{"".join(cells)}</div></body></html>')
        open(os.path.join(here, 'ill.html'), 'w', encoding='utf-8').write(page)
        print('ok dev/ill.html')
