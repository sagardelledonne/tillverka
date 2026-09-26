"""Foglio provini: tante foto (dev/snap.mjs, Puppeteer) messe in griglia in un solo PNG.
Uso: python dev/sheet.py out.png W,H cols "url|etichetta" "url|etichetta" ...
  url relativo a http://localhost:8790/ ; "index.html@macchina:0.35" = pagina intera fatta scorrere li'.
  Esempio: python dev/sheet.py dev/shots/x.png 1440,900 3 "dev/scene.html?name=intro&p=0.3&hud=0|intro 0.3"
Variabili: PAR (foto in parallelo, 4), WAIT (ms di attesa dopo il caricamento, 1500), TILE (larghezza riquadro, 600).
Gli errori della console vengono stampati e il riquadro con errori ha l'etichetta rossa."""
import sys, os, subprocess, tempfile, shutil
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
out, size, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
items = [a.split('|', 1) if '|' in a else (a, a) for a in sys.argv[4:]]
tmp = tempfile.mkdtemp()
pngs = [os.path.join(tmp, f'{i}.png') for i in range(len(items))]
args = ['node', os.path.join(here, 'snap.mjs'), size] + [f'{u}|{p}' for (u, _), p in zip(items, pngs)]
res = subprocess.run(args, capture_output=True, text=True, timeout=1800)
log = res.stdout + res.stderr
bad = set(l[4:].strip() for l in log.splitlines() if l.startswith('ERR '))
print('\n'.join(l for l in log.splitlines() if not l.startswith('ok ')))
w, h = map(int, size.split(','))
tw = int(os.environ.get('TILE', '600')); th = int(h * tw / w)
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 22)), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for i, (png, (_, label)) in enumerate(zip(pngs, items)):
    x, y = (i % cols) * tw, (i // cols) * (th + 22)
    if os.path.exists(png):
        sheet.paste(Image.open(png).convert('RGB').resize((tw, th), Image.LANCZOS), (x, y + 22))
    d.text((x + 6, y + 5), label + ('  [ERRORI]' if png in bad else ''), fill=(255, 90, 90) if png in bad else (255, 220, 140))
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
sheet.save(out)
shutil.rmtree(tmp, ignore_errors=True)
print('ok', out)
