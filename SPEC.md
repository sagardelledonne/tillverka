# Tillverka — capitolato del sito (contratto comune per chi costruisce)

Sito one-page "stile Apple" per **Tillverka Srl**, laboratorio di progettazione e stampa 3D a Milano.
Obiettivo: un capolavoro visivo che faccia percepire l'attenzione al dettaglio. Animazioni 3D guidate dallo
scroll (Three.js 0.170), esplosioni della stampante, del logo e degli oggetti realizzati.
Sito statico (GitHub Pages), niente build step, niente framework. Moduli ES + importmap.

## 1. Fatti veri (NON inventare altro: niente testimonianze, numeri di clienti, premi, specifiche macchine non elencate)

- **Tillverka Srl** · P.IVA 10677210964 · via Andrea Maria Ampère 122, 20131 Milano (zona Città Studi).
- Fondata nel **2019**. "Tillverka" in svedese vuol dire **fabbricare**. **Non citare i nomi dei fondatori.**
- Autodefinizione: "Digital fabrication labs". "Laboratorio di progettazione e stampa 3D".
- Da LinkedIn (parole loro): "rendere la prototipazione rapida una tecnologia quotidiana, alla portata di tutti.
  Dal pensiero alla realtà, per oggetti di qualsiasi tipo." Team di "grafici, designer, modellatori e stampatori".
- **2020 (Covid)**: hanno stampato **migliaia di visiere protettive** donate gratis a ospedali di Milano, strutture
  private e realtà non profit (fonte Sky TG24, 2 luglio 2020), in rete con altri maker milanesi.
- **2022**: collaborazioni con artisti e designer (vedi lavori).
- **Aprile 2026 – Milano Design Week / Fuorisalone**: sgabelli stampati in 3D per **Aura**, l'installazione di
  **Bambu Lab** al **TreeVilla Park**, quartiere Isola (via Volturno / via Confalonieri), 20–26 aprile 2026.
  Design **Pietro Bonu e Giuseppe Donvito** di Tillverka, stampati su macchine Bambu Lab.
  Nella foto: gambe a reticolo organico color argento/grafite, seduta in legno.
- **Servizi in vetrina (solo questi 3)**: **Scansione 3D**, **Modellazione 3D**, **Stampa 3D**.
- **Pubblico**: aziende (prototipi, piccole serie, pezzi tecnici), designer e artisti (sculture, arredi, lampade,
  mostre), architetti (plastici e modelli). NON i privati.
- Tecnologie/materiali visti nei loro lavori: FDM (Bambu Lab; Prusa MK3S+), resina MSLA/SLA (Prusa SL1 / SL1S,
  Formlabs Form 3+), nylon 12 con HP Multi Jet Fusion; PLA, PETG, PLA alluminio, resine trasparenti e grigie.
- **Contatti**: email **3d@tillverka.xyz** · telefono/WhatsApp **+39 392 632 3799** (wa.me/393926323799).
  Instagram https://www.instagram.com/tillverka3d/ · Facebook https://www.facebook.com/tillverka3d/ ·
  LinkedIn https://www.linkedin.com/company/tillverka3d/
- **Niente prezzi**: solo "chiedi un preventivo".

### Lavori (foto in `assets/img/lavori/`, 640 px, da Instagram, già .webp)

| file | lavoro | crediti / dati veri |
|---|---|---|
| aura-sgabelli.webp (verticale) | Sgabelli per Aura × Bambu Lab, Fuorisalone 2026 | design Pietro Bonu, Giuseppe Donvito; stampati su Bambu Lab |
| gammino-scultura.webp | Scultura in resina trasparente (figura tipo insetto/farfalla di cristallo su piedistallo) | progetto di Simone Gammino (@simone__gammino), modello 3D di Nagy (@nagy_3d, del team), stampata su Prusa SL1S |
| gammino-dettaglio.webp | Dettaglio delle ali in resina trasparente | Simone Gammino, ottobre 2022 |
| gammino-studio.webp | "Study for 3D print" (scultura digitale tipo foglie/piume) | progetto Simone Gammino, modello @nagy_3d |
| zigzig-lamp.webp | Zigzig lamp: lampada a sospensione nera rigata con fessura a zig-zag luminosa | ispirata al vaso di @ysoftbe3d, PLA su Prusa MK3S+, strato 0,2 mm |
| ganesha.webp | Ganesha | modello @nagy_3d; Prusa SL1, resina Prusament Tough Grey, strato 0,05 mm, 7 h 35 min |
| kitsch-flylaly.webp | Fly-la-ly (Kitsch&Monsters) | personaggi di @espressiva_mente (kitschandmonsters.com), modellati da @nagy_3d; Prusa MK3S+, strato 0,1 mm, 24 h |
| kitsch-tobu.webp | Tobu (Kitsch&Monsters) | PETG blu Extrudr, strato 0,1 mm, 24 h |
| kitsch-zenlizard.webp | Zen-Lizard (Kitsch&Monsters) | PETG rosso "hellfire" Extrudr, strato 0,1 mm, 24 h |
| tillien.webp | Tillien (alieno) | modello @nagy_3d; Prusa MK3S, PLA alluminio, strato 0,1 mm, 48 h |
| xerra-nylon.webp | Pezzo di design in nylon | per Victoria Xerra (@vixonthemix); nylon 12, HP Multi Jet Fusion |
| miniature-form3.webp | Miniature (armi in scala, piatto pieno di pezzi) | modelli di Adriano Amenta; Formlabs Form 3+, resina grigia |
| lab-diorama.webp (960×540) | Il laboratorio in diorama 3D low-poly (copertina Facebook) | illustrazione del loro lab |

## 2. Identità visiva

- **Stile misto nero/bianco**, alternando sezioni (come Apple): nero `#050506`, bianco carta `#f5f5f7`, testo
  scuro `#1d1d1f`, grigio testo `#86868b` (su bianco) / `#a1a1a6` (su nero).
- **Colori firma (pochi tocchi, mai tanti):**
  - **argento vivo** (cromo liquido): materiale 3D principale + testo "cromato" con gradiente animato
    (`linear-gradient` argento, `background-clip:text`), bordi sottili.
  - **oro** `#d9b36a` (chiaro `#ecd08f`, scuro `#a87d3a`): pulsante principale, dettagli, strato appena stampato
    che brilla.
  - **bambù**: verde bambù `#9fb46a` (piccoli accenti: puntini di stato, tag, successo) e legno di bambù
    `#d9c18d` (sedute degli sgabelli, dettagli caldi).
- Font: **di sistema** (niente Google Fonts): `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
  Titoli grandi, peso 600–700, `letter-spacing` negativo (-0.02 / -0.035em), `text-wrap: balance`.
- Logo: tre pezzi estrusi a triscele (vedi `assets/js/three/logo-shape.js`, `assets/img/logo-white.svg`,
  `logo-black.svg`, `favicon.svg`). Nel logo originale c'è anche la sigla "TLK" piccola in alto a destra.
- Tono dei testi: **dai del tu** ("Dai forma alla tua idea"). Frasi corte, precise, eleganti. Italiano + inglese.

## 3. Struttura file e chi li possiede

```
index.html                  (PAGE)   tutti i testi IT, markup, SEO, JSON-LD
assets/css/style.css        (PAGE)
assets/js/main.js           (PAGE)   UI: nav, lingua, testi a scroll, galleria, modulo, timeline
assets/js/i18n.js           (PAGE)   dizionario EN (l'italiano sta nell'HTML)
assets/js/scroll.js         (CORE, già scritto) progressOf(el), seg(), watchPins()
assets/js/stages.js         (CORE, già scritto) monta le scene sulle sezioni [data-stage]
assets/js/three/core.js     (CORE, già scritto) mountStage, easing, damp...
assets/js/three/materials.js(CORE, già scritto) ambiente studio + materiali (argento vivo, oro, bambù...)
assets/js/three/logo-shape.js(CORE, già scritto) poligoni del logo
assets/js/three/intro-scene.js   (INTRO)   logo + mission/vision
assets/js/three/printer-scene.js (PRINTER) stampante chiusa che esplode e stampa
assets/js/three/works-scene.js   (WORKS)   sgabello Aura, scultura in resina, lampada Zigzig
dev/scene.html?name=intro|printer|works|smoke&p=0.4   pagina di prova di una scena (p blocca l'avanzamento)
dev/smoke-scene.js          esempio minimo di scena (logo estruso)
```
Non modificare i file CORE senza motivo forte; se serve, aggiungi nel TUO file. Ognuno tocca solo i suoi file.
Anteprima locale senza cache: server `python dev/serve.py 8790` → http://localhost:8790/ (già attivo durante il lavoro).

## 4. Contratto delle scene 3D

```js
// assets/js/three/xxx-scene.js
import * as THREE from 'three';
import { seg, smoothstep, easeInOutCubic, easeOutCubic, easeOutBack, damp, lerp, clamp01 } from './core.js';
import { mat, COLORS, radialTexture, layerLinesTexture, bambooTexture } from './materials.js';
export async function create(ctx) {
  // ctx = { THREE, renderer, canvas, section, overlay, env, theme, reduceMotion, small, project }
  return { scene, camera, update(state) { ... }, resize(w, h) { ... } };
}
// state = { p, pRaw, t, dt, pointer:{x,y}, w, h, aspect, small }
```
- Il core fa: renderer (alpha, sfondo trasparente: il colore lo dà la sezione HTML), tone mapping Neutral,
  `scene.environment = env` (studio: pannelli luminosi che si riflettono nel cromo), DPR max 2 (1.5 su mobile),
  resize, disegno solo a sezione visibile, precompilazione shader, puntatore ammorbidito, `p` ammorbidito.
- `p` = avanzamento 0..1 della sezione. Tutte le pose devono essere **funzioni pure di p** (+ piccolo moto idle
  basato su `t` e `pointer`, disattivato se `ctx.reduceMotion`). Tornando indietro con lo scroll tutto si riavvolge.
- **Composizione**: il testo sta in sovrimpressione (HTML). Su desktop (aspect ≥ 1) nelle fasi con molto testo il
  3D sta a **destra** (centro a ~+22% della larghezza), il testo a sinistra. Su mobile (aspect < 0.85) il 3D sta
  nella **metà alta** (centro a ~30% dall'alto), il testo in basso. Tecnica consigliata:
  `camera.setViewOffset(w, h, -offsetX, -offsetY, w, h)` per spostare il centro ottico senza muovere gli oggetti,
  con offset interpolati in base a p. Gli oggetti devono **sempre stare interi nello schermo** (anche a 375×812).
- Etichette (callout): l'HTML mette nel `.pin-sticky` elementi `.callout[data-part="nome"]`. La scena, ogni
  frame, calcola la posizione a schermo del punto di ancoraggio del pezzo (`ctx.project(vec3World)`) e fa
  `el.style.setProperty('--x', x+'px'); el.style.setProperty('--y', y+'px')`. Cerca gli elementi con
  `ctx.overlay.querySelectorAll('.callout[data-part]')` (possono non esistere: nessun errore). Imposta anche
  `el.dataset.side = 'left'|'right'` in base a che metà dello schermo sta il punto (l'HTML gira l'etichetta).
  La visibilità (quando appaiono) la decide l'HTML con data-from/data-to, NON la scena.
- Qualità: bevel su tutti gli spigoli (niente spigoli vivi da CAD), materiali di `materials.js`, luci morbide
  (1 key + 1 rim + 1 fill al massimo, ombre solo se servono e con mappa ≤ 2048), un'"ombra di contatto" finta
  (piano con `radialTexture` scura sotto gli oggetti) al posto di shadow map dove possibile. Dettagli piccoli
  curati (viti, fessure, cavi, texture degli strati di stampa) = "attenzione al dettaglio".
- Prestazioni: ≤ ~250k triangoli per scena, geometrie create una volta (niente `new` dentro update), riusa
  Vector3/Matrix4 temporanei, `InstancedMesh` per elementi ripetuti, niente postprocessing pesante (niente
  EffectComposer). Il bagliore = sprite/mesh additiva con `radialTexture` e `mat.glow()` (toneMapped:false).
  Transmission (`mat.crystalResin`) solo sulla scultura. Su `ctx.small` riduci suddivisioni e DPR resta del core.
- Colori sfondo: le sezioni scure sono nere, la stampante è su bianco (`theme:'light'`). La scena deve stare
  bene sul suo sfondo.

## 5. Sezioni, id e tempi (p) — la scena e i testi usano gli STESSI intervalli

La pagina (PAGE) scrive per ogni sezione "pinned":
```html
<section id="intro" class="pin dark" data-pin data-stage="intro" data-theme="dark" style="--pin:7">
  <div class="pin-sticky">
    <canvas class="stage" aria-hidden="true"></canvas>
    <!-- fallback se niente WebGL: .stage-fallback (immagine/svg), mostrata con .no-webgl -->
    <div class="step" data-from="0" data-to="0.14"> ... testo ... </div>
    ...
    <div class="callout" data-part="..."> ... </div>
  </div>
</section>
```
Altezza sezione = `calc(var(--pin) * 100svh)`, `.pin-sticky { position: sticky; top: 0; height: 100svh }`.
main.js: con `watchPins()` + evento `pin:progress`, ogni `.step`/`.callout` riceve la classe `is-on` quando
`from ≤ p < to` (transizioni CSS di opacità/traslazione/blur), e `--lp` = avanzamento locale nel suo intervallo.

### 5.1 `#intro` — hero + mission + vision (nero, `--pin: 7`) — scena INTRO

Logo 3D in **argento vivo** (faccia) con canale in **grafite lucida** e sottile filo **oro** sul bordo del canale.
All'avvio (a tempo, non scroll, ~2,4 s; salta se reduceMotion): i tre pezzi arrivano da fuori campo ruotando e si
incastrano, con un lampo di luce oro che scorre (sheen) sul cromo nel momento dell'incastro. Poi fluttua piano
(±10° su Y, leggero parallax col puntatore).

| p | fase | 3D | testo (PAGE) |
|---|---|---|---|
| 0.00–0.14 | HERO | logo al centro (poco sopra il centro; su mobile nella metà alta), grande | eyebrow "Tillverka · Digital fabrication lab · Milano", H1 "Dal pensiero alla materia.", sottotitolo, 2 bottoni (Chiedi un preventivo / Guarda i lavori), invito a scorrere |
| 0.14–0.26 | NOME | il logo ruota di 3/4 mostrando lo spessore, scivola a destra (mobile: resta in alto) | "Tillverka. In svedese vuol dire *fabbricare*." |
| 0.26–0.42 | MISSION | i tre pezzi si separano appena (esplosione morbida, ~35%) e ruotano lenti | MISSION: frase grande che si "accende" parola per parola con --lp |
| 0.42–0.52 | PILASTRO 1 | il pezzo 0 viene avanti; effetto **scansione**: un piano laser sottile (oro/bambù) lo attraversa, dietro al piano il pezzo è nuvola di punti/wireframe, davanti è solido | "01 · Scansione 3D — Dal reale al digitale." |
| 0.52–0.62 | PILASTRO 2 | il pezzo 1 viene avanti; effetto **modellazione**: spigoli wireframe luminosi che si "chiudono" in superficie | "02 · Modellazione 3D — Dall'idea al file." |
| 0.62–0.72 | PILASTRO 3 | il pezzo 2 viene avanti; effetto **stampa**: cresce strato dopo strato dal basso (piano di taglio che sale) con il bordo dello strato che brilla oro | "03 · Stampa 3D — Dal file all'oggetto." |
| 0.72–0.88 | VISION | i pezzi orbitano e tornano verso il centro; camera arretra | VISION: frase grande parola per parola |
| 0.88–1.00 | RICOMPOSIZIONE | i pezzi si incastrano di nuovo (scatto + lampo oro), logo frontale, al centro | "Tre gesti. Un solo verbo: fabbricare." (o simile) |

Mission (proposta approvata come bozza): "Rendere la fabbricazione digitale una tecnologia di tutti i giorni.
Dal pensiero alla realtà, per oggetti di qualsiasi tipo."
Vision: "Chi progetta — un'azienda, un designer, un architetto — deve poter toccare la propria idea il giorno
dopo averla pensata."
I tre pezzi del logo = i tre servizi (scansione, modellazione, stampa): è l'idea creativa del sito.

### 5.2 `#macchina` — la stampante che esplode (bianco `#f5f5f7`, `--pin: 6`) — scena PRINTER

Stampante FDM **chiusa** (cubo con pannelli di vetro fumé e porta, tipo CoreXY desktop; NON copiare un marchio:
nessun logo altrui, nome "Tillverka" o il logo triscele piccolo sul frontale), materiali: scocca grafite opaca,
spigoli in alluminio satinato, vetro, dettagli oro, bobine sopra (unità multimateriale con 4 bobine: argento
vivo, oro, verde bambù, nero). Dentro: piatto, testina con ugello (punta che brilla oro quando stampa), assi
CoreXY con cinghie e barre lucide, schermo sul frontale.

`data-part` dei callout: `enclosure` (pannelli/vetro/coperchio), `frame` (telaio), `gantry` (assi CoreXY),
`toolhead` (testina e ugello), `bed` (piatto), `spools` (bobine / multimateriale).

| p | fase | 3D | testo |
|---|---|---|---|
| 0.00–0.12 | PRESENTAZIONE | stampante intera, vista 3/4, gira lenta su un piedistallo di luce | "La macchina." + sottotitolo |
| 0.12–0.50 | ESPLOSIONE | i gruppi si separano in sequenza lungo assi puliti (stagger): enclosure 0.12–0.22, spools 0.18–0.28, gantry+toolhead 0.24–0.36, bed 0.30–0.40, schermo/elettronica 0.34–0.44; frame resta come riferimento. A 0.44–0.50 tutto esploso, rotazione lenta | callout che appaiono in ordine (enclosure 0.14–0.50, spools 0.20–0.50, gantry 0.26–0.50, toolhead 0.30–0.50, bed 0.34–0.50, frame 0.40–0.50) |
| 0.50–0.64 | RICOMPOSIZIONE | tutto torna al suo posto | "Ogni pezzo al suo posto." |
| 0.64–1.00 | STAMPA | la camera entra nella camera di stampa; la testina si muove su un percorso; sul piatto cresce **il logo Tillverka in miniatura** in filamento argento (texture strati), strato dopo strato, con lo strato in cima che brilla oro; a 0.95 finito, la testina si alza | "Strato dopo strato." poi "Dal file al pezzo finito." |

### 5.3 `#lavori` — tre lavori veri ricreati in 3D + la loro foto (`--pin: 7`) — scena WORKS

Sfondo della sezione (lo anima PAGE con --p): **bianco** nel segmento 1 → **nero** nei segmenti 2 e 3
(transizione a 0.30–0.38). La scena ha sfondo trasparente e deve stare bene su entrambi.

| p | segmento | 3D | testo + foto vera (PAGE) |
|---|---|---|---|
| 0.00–0.34 | **Aura × Bambu Lab** | **sgabello**: seduta in legno di bambù (cilindro basso con bordo arrotondato e fughe), gambe a **reticolo organico** (rami che si dividono e si ricongiungono, stile Voronoi/crescita, color argento satinato/PLA alluminio). 0.00–0.12 si stampa (piano che sale, strato oro); 0.12–0.20 gira; 0.20–0.30 esplode (seduta sale, reticolo si apre in rami); 0.30–0.34 si ricompone | titolo, "Fuorisalone 2026 · TreeVilla Park, Isola", crediti design, "stampati su Bambu Lab", foto aura-sgabelli.webp |
| 0.34–0.67 | **Resina trasparente × Simone Gammino** | **scultura cristallo** simmetrica tipo insetto/farfalla: spina centrale di "vertebre", 2–3 coppie di ali fatte di petali/lame sottili sovrapposte, antenne sottili, su un piedistallo basso grafite. Materiale `mat.crystalResin()`. Le ali si aprono (petali ruotano in fuori) 0.36–0.50, rotazione lenta, riflessi | crediti, "Prusa SL1S · resina", foto gammino-scultura.webp |
| 0.67–1.00 | **Zigzig lamp** | **lampada a sospensione**: corpo cilindrico nero a costole verticali (rigato), fessura a **zig-zag** che si illumina oro caldo, cavo dall'alto. 0.67–0.74 scende dal soffitto; 0.74–0.80 si accende (fessura + alone + pozza di luce sotto); 0.80–0.93 **esplode** in anelli/fette orizzontali che si separano in verticale mostrando la luce dentro; 0.93–1.00 si ricompone | "Zigzig lamp", "PLA · Prusa MK3S+ · strato 0,2 mm", ispirazione @ysoftbe3d, foto zigzig-lamp.webp |

### 5.4 Sezioni senza scena 3D (PAGE)

- `#galleria` (bianco): "Altri lavori" — griglia/carosello orizzontale di card con foto + crediti + dati di stampa
  (Kitsch&Monsters ×3, Ganesha, Tillien, nylon MJF per Victoria Xerra, miniature Form 3+, Gammino dettaglio e
  studio, diorama del lab). Hover: leggera inclinazione 3D (tilt) e riflesso.
- `#servizi` (nero): i 3 servizi con mini-animazioni SVG/CSS (scansione: linea che scorre su una sagoma;
  modellazione: wireframe che si disegna; stampa: strati che si impilano). Poi "Per chi lavoriamo" (aziende,
  designer e artisti, architetti), "Come funziona" (4 passi: idea/file → modello → stampa → finitura e consegna),
  "Tecnologie e materiali" (chip).
- `#storia` (bianco o nero, alterna): timeline 2019 · 2020 · 2022 · 2026.
- `#preventivo` (bianco): modulo → apre WhatsApp o email già compilati (niente server, niente dati salvati).
- footer `#contatti` (nero): contatti, social, indirizzo, P.IVA, © 2026 Tillverka Srl, logo con "TLK".

## 6. Regole generali

- Accessibilità: testo vero in HTML (non nelle scene), `aria-hidden` sui canvas, contrasto AA, focus visibile,
  `prefers-reduced-motion` rispettato (niente moto idle, transizioni brevi), navigazione da tastiera.
- Mobile first: tutto deve funzionare a 375×812 senza scroll orizzontale; 3D più leggero.
- Fallback senza WebGL: `.no-webgl` sulla sezione → mostra immagine/svg statico al posto del canvas.
- Nessuna libreria oltre a three (jsdelivr). Niente Google Fonts, niente tracker.
- Commenti nel codice brevi, in italiano, come nei file CORE.

## 7. ESPANSIONE (26/09): molto più 3D, molte più esplosioni

Il cliente vuole "tante cose 3D, tante esplosioni", qualità altissima. Nuove scene e sezioni. Ordine finale della pagina
(alternanza nero/bianco):

| # | id | tema | tipo | scena | --pin |
|---|---|---|---|---|---|
| 1 | #intro | nero | pinned | intro | 7 |
| 2 | #macchina | bianco | pinned | printer | 6 |
| 3 | #anatomia | nero | pinned | **anatomy** (nuova) | 5 |
| 4 | #tecnologie | bianco | pinned | **tech** (nuova) | 7 |
| 5 | #lavori | bianco→nero | pinned | works | 7 |
| 6 | #galleria | bianco | normale | – | – |
| 7 | #perchi | nero | pinned | **audience** (nuova) | 7 |
| 8 | #servizi | bianco | normale + illustrazioni SVG | – | – |
| 9 | #storia | nero | normale; dentro, una card 3D `data-pin="view" data-stage="visor"` accanto al 2020 | **visor** (nuova) | – |
| 10 | #preventivo | bianco | normale | – | – |
| 11 | #laboratorio | nero | pinned | **lab** (nuova) | 4 |
| 12 | footer #contatti | nero | – | – | – |

`stages.js` monta/spegne da solo le scene (max ~3-4 accese): una scena deve poter essere distrutta e ricreata
(il core chiama `dispose?()` e libera geometrie/materiali/texture della scena). Niente stato globale che si rompe al
rimontaggio (es. l'animazione d'ingresso del logo va fatta **una sola volta per pagina**: flag su `window`).
`data-pin="view"` = card normale non fissata: p va da 0 (entra dal basso) a 1 (esce dall'alto).
Harness: `dev/scene.html?name=<scena>&p=..&hud=0` (le etichette di prova hanno i data-part elencati sotto).

### 7.1 #anatomia — "Anatomia di un pezzo" (nero, --pin:5) — scena `anatomy-scene.js`
Un pezzo tecnico elegante stampato in PLA argento (es. staffa/supporto arrotondato con due fori e un raggio interno,
~ proporzioni da oggetto reale), con righe degli strati visibili in macro.
| p | fase | 3D | testo |
|---|---|---|---|
| 0.00–0.12 | pezzo intero | gira lento, luce radente che esalta gli strati | "Anatomia di un pezzo." |
| 0.12–0.30 | sezione | un piano di taglio lo apre a metà: dentro si vedono pareti e riempimento | "Dentro, non è pieno." |
| 0.30–0.62 | ESPLOSIONE | si separa in verticale: tetto (strati pieni in alto), pareti (perimetri concentrici sottili), **riempimento gyroid** (superficie gyroid vera: MarchingCubes di 'three/addons/objects/MarchingCubes.js' con campo sin/cos, o mesh precalcolata), fondo, **supporti ad albero** (verde bambù), brim | callout `skin`, `walls`, `infill`, `supports`, `layers` |
| 0.62–0.80 | riempimento su misura | il riempimento cambia schema/densità (griglia → nido d'ape → gyroid) | "Leggero o robusto: lo decidiamo insieme." |
| 0.80–1.00 | ricomposizione | torna intero, bagliore oro che si spegne (si raffredda) | "Ogni pezzo, pensato fino all'ultimo strato." |

### 7.2 #tecnologie — "Tre tecnologie" (bianco, --pin:7) — scena `tech-scene.js`
| p | segmento | 3D | callout |
|---|---|---|---|
| 0.00–0.33 | **Filamento (FDM)** | hotend in macro: dissipatore alettato (argento satinato), heatbreak, blocco riscaldante con cartuccia e termistore (cavetti), ugello ottone/oro. Esplode in verticale 0.06–0.20; 0.20–0.33 il filamento verde bambù entra, fonde (bagliore oro) ed esce stendendo un cordolo su un piatto | `heatsink`, `heatbreak`, `heater`, `nozzle` |
| 0.33–0.66 | **Resina (MSLA/SLA)** | stampante a resina esplosa 0.36–0.50: coperchio in vetro ambrato/dorato, vasca con resina trasparente, pellicola, schermo LCD che mostra la "fetta" (sagoma della scultura), matrice di luci UV (luce fredda tenue), piatto di stampa su asse Z; 0.50–0.66 il piatto scende nella vasca e risale con un pezzo trasparente appeso a testa in giù che cresce | `lid`, `vat`, `screen`, `uvlight`, `plate` |
| 0.66–1.00 | **Nylon 12 (HP Multi Jet Fusion)** | un blocco di polvere bianca (particelle); 0.68–0.85 la polvere vola via (soffiata) e rivela pezzi in nylon grigio opaco incastrati (sfera a reticolo, ingranaggio, staffa, il logo); 0.85–1.00 i pezzi fluttuano e ruotano ordinati | – |
Testi (PAGE): FDM "Robusto, veloce, versatile: PLA, PETG, PLA alluminio."; Resina "Dettaglio finissimo, strati da 0,05 mm, anche trasparente."; Nylon "Pezzi tecnici resistenti, senza supporti." (non inventare altre specifiche).

### 7.3 #perchi — "Per chi lavoriamo" (nero, --pin:7) — scena `audience-scene.js`
| p | segmento | 3D | callout |
|---|---|---|---|
| 0.00–0.33 | **Aziende** | prototipo meccanico: riduttore compatto con due gusci (grafite + argento satinato), rotismo epicicloidale (sole, 3 satelliti, corona) argento/oro, albero, cuscinetti, viti oro, guarnizione verde bambù. Vista esplosa tecnica lungo l'asse 0.06–0.22 (gli ingranaggi girano ingranando), ricomposizione 0.26–0.33 | `housing`, `gears`, `shaft`, `bearings`, `screws` |
| 0.33–0.66 | **Architetti** | plastico: base a curve di livello impilate (legno di bambù, strati), edificio moderno bianco opaco con fasce vetrate; 0.40–0.55 i piani si separano in verticale mostrando solai e pareti interne; alberelli, dettagli minuti | `floors`, `facade`, `site` |
| 0.66–1.00 | **Designer e artisti** | vaso/lampada parametrico generativo (torsione + costolature, superficie con strati), filamento seta verde bambù→oro; si trasforma in 3 forme 0.68–0.88; esplode in anelli-strato 0.88–0.96 e si ricompone | – |

### 7.4 card 3D in #storia — "La visiera del 2020" — scena `visor-scene.js` (data-pin="view", bianco o nero come la card)
Visiera protettiva stampata: archetto (PLA bianco/verde bambù), **tre agganci a incastro** (oro), schermo trasparente
(foglio curvo, vetro), elastico. p (view): 0.25–0.50 esplode, 0.50–0.75 si ricompone, moto idle lento. Callout `band`, `clips`, `shield`.
Testo (PAGE): "2020 · Migliaia di visiere stampate e donate agli ospedali di Milano." (fatti di SPEC §1).

### 7.5 #laboratorio — "Il laboratorio" (nero, --pin:4) — scena `lab-scene.js`
Diorama isometrico low-poly del laboratorio, ispirato alla loro copertina Facebook (`assets/img/lavori/lab-diorama.webp`)
ma nella nostra palette: lastra del pavimento a strati con cavi sotto, tavoli a cavalletto in bambù, stampanti chiuse con
luce interna, scaffali di bobine colorate (argento, oro, verde bambù, nero), cabina di scansione con un dinosauro low-poly
in wireframe, monitor, lampade. 0.00–0.30 entra ruotando; 0.30–0.60 **esplode per strati** in verticale (cavi, lastra,
pavimento, arredi, macchine, luci); 0.60–0.85 si ricompone e le stampanti si accendono; 0.85–1.00 la camera sale in
vista dall'alto. Callout `printers`, `scanner`, `desks`, `shelves`.
Testo (PAGE): "Il laboratorio. Via Ampère 122, Milano — Città Studi." + pulsante preventivo.

### 7.6 Illustrazioni (PAGE)
Oltre al 3D: illustrazioni vettoriali di qualità (SVG inline, tratto sottile argento/oro, stile disegno tecnico /
blueprint, che si "disegnano" allo scroll con stroke-dashoffset): in #servizi una per servizio (scanner che legge un
oggetto; wireframe CAD con quote; ugello che deposita strati), una striscia "Come funziona" illustrata (4 passi),
confronto altezze di strato (0,05 / 0,1 / 0,2 mm, dati veri dei lavori), piccoli dettagli decorativi (righe degli
strati, quote, crocini di registro). Niente clipart: coerenti con il resto.
