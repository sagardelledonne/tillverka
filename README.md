# Tillverka — sito one-page

Sito statico (GitHub Pages) per **Tillverka Srl**, laboratorio di progettazione e stampa 3D a Milano.
Stile "pagina prodotto Apple": sezioni nere e bianche, animazioni 3D guidate dallo scroll (Three.js 0.170 da jsdelivr).
Niente build step, niente framework: moduli ES + importmap. Il contratto comune (fatti veri, palette, tempi) è in `SPEC.md`.

## Anteprima

```bash
python dev/serve.py 8790          # server senza cache → http://localhost:8790/
```

- `?lang=en` apre la pagina in inglese (la scelta fatta con il selettore IT/EN resta memorizzata nel browser).
- `?at=intro:0.35` salta subito a una sezione fissata e a un punto del suo avanzamento; `?at=galleria` per le
  sezioni normali. Serve per controlli e foto. Con `?at` (o `?debug`) gli errori JS compaiono in un riquadro rosso.
- Una scena 3D da sola: `dev/scene.html?name=intro|printer|anatomy|tech|works|audience|visor|lab&p=0.4&hud=0`.
- Fogli provini (Puppeteer; serve `cd dev && npm i puppeteer-core@23`, e se jsdelivr non è raggiungibile anche
  `npm i --no-save three@0.170.0`: `dev/snap.mjs` lo serve al posto della CDN; trova da solo Chrome su Windows o
  il Chromium di Linux):
  - una scena a più valori di p: `bash dev/an.sh anatomy dev/shots/an.png 1440,900 4 0.05 0.2 0.5 0.8`
  - tutta la pagina, ogni passo di ogni sezione: `python dev/full.py dev/shots/full 1440,900` (telefono `390,844`,
    inglese: terzo argomento `en`, solo alcune sezioni: quarto argomento `intro,perchi`)
  - una pagina qualsiasi: `python dev/sheet.py dev/shots/x.png 1440,900 2 "index.html@macchina:0.35|etichetta"`
- Con WebGL software (swiftshader) le scene impiegano 10–15 s a comparire e le transizioni CSS rallentano: un testo
  sfocato o una foto nera in un provino di solito è solo il browser di prova (rifai lo scatto con `PAR=1 WAIT=4000`).
- Disegni tecnici SVG (servizi, altezze di strato, Come funziona, riserve senza WebGL): li genera `python dev/ill.py`
  (`--preview` scrive anche `dev/ill.html` per vederli tutti insieme). Anteprima social: `dev/og.html` → `assets/img/og.jpg`.

## File

| file | cosa fa |
|---|---|
| `index.html` | tutti i testi italiani, markup delle sezioni, SEO (meta, og, canonical, hreflang), JSON-LD LocalBusiness, importmap, simboli SVG del logo |
| `assets/css/style.css` | tipografia, toni chiaro/scuro, sezioni fissate, testi in sovrimpressione, etichette, legenda, galleria, servizi, timeline, modulo, footer, mobile, riduzione del movimento |
| `assets/js/main.js` | lingua IT/EN, passi ed etichette sincronizzati allo scroll, parole che si accendono, sfondo di `#lavori`, nav che cambia tono, menu mobile, comparse, tilt della galleria, etichette senza sovrapposizioni, modulo → WhatsApp / email, aiuto `?at=` |
| `assets/js/i18n.js` | `en`: dizionario inglese completo · `it`: le poche stringhe italiane usate solo dal codice (modulo, menu, titolo) |
| `assets/js/scroll.js` | (core) avanzamento `p` delle sezioni `[data-pin]`, evento `pin:progress`, variabile `--p` |
| `assets/js/stages.js` | (core) monta le scene 3D sulle sezioni `[data-stage]` |
| `assets/js/three/*` | (core + scene) motore, materiali, logo; scene `intro`, `printer`, `anatomy`, `tech`, `works`, `audience`, `visor`, `lab`; `kit.js` = attrezzi comuni di `anatomy` e `audience` |

### Sezioni

`nav` → `#intro` (nero, fissata 7 schermi: hero, nome, missione, 3 pilastri, visione, finale) → `#macchina` (bianco,
6 schermi: stampante esplosa e stampa) → `#anatomia` (nero, 5: staffa in sezione ed esplosa, riempimenti) →
`#tecnologie` (bianco, 7: FDM, resina, nylon) → `#lavori` (7 schermi: Aura, scultura in resina, Zigzig; sfondo bianco →
nero a p 0.30–0.38) → `#galleria` → `#perchi` (nero, 7: riduttore, plastico, vaso) → `#servizi` (disegni tecnici) →
`#storia` (card 3D della visiera) → `#preventivo` → `#laboratorio` (nero, 4: diorama) → footer `#contatti`.

### Come funziona una sezione fissata

`<section data-pin style="--pin:7">` è alta 7 schermi; dentro, `.pin-sticky` resta fermo e `p` va da 0 a 1.
Ogni `.step` / `.callout` ha `data-from` / `data-to`: `main.js` aggiunge `.is-on` quando `from ≤ p < to` e scrive
`--lp` (avanzamento locale, usato per le parole della missione, le barrette dei pilastri e la legenda).
Gli intervalli sono quelli di `SPEC.md` §5, gli stessi delle scene 3D: se cambiano, vanno cambiati in entrambi.

- Etichette (`.callout[data-part]`): la scena scrive `--x/--y` e `data-side`; `main.js` le allontana se si toccano
  (`--dy`) e inclina il filo (`--len`, `--ang`).
- Senza WebGL (o se una scena fallisce) la sezione riceve `.no-webgl`: si vede `.stage-fallback` (logo SVG,
  stampante disegnata, foto vere in grande) e le etichette spariscono.
- `#intro` riceve `data-phase` (indice del passo attivo), `#lavori` riceve `data-seg` (0/1/2), `data-tone` e `--bg`.

### Testi e traduzioni

L'italiano sta nell'HTML con `data-i18n="chiave"` (può contenere `<span class="chrome">`) e
`data-i18n-attr="alt:chiave"` per alt / placeholder / aria-label. Ogni chiave deve esistere in `assets/js/i18n.js`.
Controllo rapido:

```bash
node -e 'const h=require("fs").readFileSync("index.html","utf8");import("./assets/js/i18n.js").then(({en})=>{const k=new Set([...h.matchAll(/data-i18n="([^"]+)"/g)].map(x=>x[1]));[...h.matchAll(/data-i18n-attr="([^"]+)"/g)].forEach(m=>m[1].split(";").forEach(p=>k.add(p.split(":")[1])));console.log(k.size,"chiavi, mancano:",[...k].filter(x=>!(x in en)))})'
```

### Modulo preventivo

Nessun server e nessun dato salvato: il modulo controlla i campi obbligatori, compone il messaggio nella lingua
attiva e apre `wa.me/393926323799?text=…` (nuova scheda) oppure `mailto:3d@tillverka.xyz?subject=…&body=…`.

## Da completare

- Foto dei lavori in alta risoluzione (ora 640 px, prese da Instagram): in galleria non vengono mai ingrandite oltre
  la misura originale, ma su schermi retina sarebbero più nitide.
- Rilettura finale di testi e crediti con Tillverka (missione e visione sono bozze approvate).
- Dominio definitivo: aggiornare `canonical`, `og:url`, `hreflang` e JSON-LD se il sito non resta su
  `sagardelledonne.github.io/tillverka/`.
