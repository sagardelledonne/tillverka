"""Fogli provini della pagina intera: ogni passo di ogni sezione fissata (a 60% del passo) + le sezioni normali.
Uso: python dev/full.py <cartella> <W,H> [lang] [sezioni separate da virgola]   → un PNG per sezione in <cartella>"""
import re, sys, os, subprocess
here = os.path.dirname(os.path.abspath(__file__))
out, size = sys.argv[1], sys.argv[2]
lang = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '-' else ''
only = sys.argv[4].split(',') if len(sys.argv) > 4 else None
h = open(os.path.join(here, '..', 'index.html'), encoding='utf-8').read()
q = f'?lang={lang}' if lang else ''
plan = {}
for m in re.finditer(r'<section id="([^"]+)"([^>]*)>(.*?)</section>', h, re.S):
    sid, attrs, body = m.groups()
    if only and sid not in only: continue
    pin = 'data-pin' in attrs and 'data-pin="view"' not in attrs
    steps = re.findall(r'class="step[^"]*" data-from="([\d.]+)" data-to="([\d.]+)"', body)
    if pin: pts = [round(float(a) + (float(b) - float(a)) * 0.6, 3) for a, b in steps]
    else: pts = [0, 0.25, 0.5, 0.75, 1]
    plan[sid] = pts
if not only or 'contatti' in only: plan['contatti'] = [None]
os.makedirs(out, exist_ok=True)
for sid, pts in plan.items():
    items = [f'index.html{q}@{sid}' + ('' if p is None else f':{p}') + f'|{sid} {"" if p is None else p}' for p in pts]
    cols = 4 if len(items) > 4 else len(items)
    subprocess.run(['python3', os.path.join(here, 'sheet.py'), os.path.join(out, f'{sid}.png'), size, str(cols), *items])
