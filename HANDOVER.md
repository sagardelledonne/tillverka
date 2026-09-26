# Tillverka · sito web — documento di passaggio (26/09/2026)

Da leggere per primo in una nuova chat/sessione. Poi `SPEC.md` (capitolato vincolante) e `README.md`.

## 1. Il progetto in breve

- **Cliente:** Tillverka Srl, laboratorio di progettazione e stampa 3D, via Andrea Maria Ampère 122, 20131 Milano
  (Città Studi), P.IVA 10677210964. Azienda di Nicholas North, amico di Sagar (l'utente), che gli dà del tu.
- **Richiesta di Sagar:** un sito "capolavoro visivo" stile pagina prodotto Apple, con tante animazioni 3D guidate dallo
  scroll e **tante esplosioni** (stampante, logo, oggetti stampati), illustrazioni, qualità altissima; logo esistente
  animato; un bel focus su **mission e vision**.
- **Tecnica:** sito statico, niente build. `index.html` + CSS + moduli ES; Three.js 0.170 da jsdelivr (importmap).
  Si pubblicherà su GitHub Pages (`sagardelledonne.github.io/tillverka`), il workflow è già pronto in
  `.github/workflows/pages.yml` (pubblica solo `index.html` e `assets/`). **Repo GitHub non ancora creato.**
- **Cartella:** `C:\Users\boate\projects\tillverka` (git locale, 6 commit; `git log` per la storia).

## 2. Decisioni prese con Sagar (non rimetterle in discussione)

- Stile **misto nero/bianco** alternato; colori firma: **argento vivo** (cromo liquido), **oro**, **bambù**
  (verde bambù + legno di bambù). Font di sistema, niente Google Fonts.
- **Italiano + inglese** (pulsante IT/EN). Testi **col tu**.
- Obiettivi: **preventivo** (modulo che apre WhatsApp/email già compilati, nessun server), **WhatsApp/chiamata**,
  **portfolio**. Non il negozio.
- Pubblico: **aziende, designer e artisti, architetti** (non i privati).
- Servizi in vetrina: **scansione 3D, modellazione 3D, stampa 3D**. **Niente prezzi.**
- Foto vere dei lavori **+ ricostruzione 3D** degli stessi oggetti. Citare tutti i collaboratori con i crediti.
- **Niente nomi dei fondatori.** Storia con le **visiere 2020** per gli ospedali.
- Contatti: **3d@tillverka.xyz**, **+39 392 632 3799** (WhatsApp messo di default, non confermato).
- Stampante esplosa = **a filamento, chiusa** (senza marchi altrui).
- Fatti veri e crediti: tutti in `SPEC.md` §1 (fonti: Instagram/Facebook/LinkedIn di Tillverka, Sky TG24 2020,
  VoxelMatters per il Fuorisalone 2026 con Bambu Lab). **Non inventare** testimonianze, numeri, premi, specifiche.

## 3. Struttura

```
index.html                  tutti i testi IT (data-i18n), sezioni, SEO, JSON-LD
assets/css/style.css        grafica
assets/js/main.js           UI: nav, lingua, testi a scroll (.step data-from/data-to), galleria, modulo; ?at=id:p
assets/js/i18n.js           dizionario inglese
assets/js/scroll.js         avanzamento p delle sezioni [data-pin] (0..1); data-pin="view" per card non fissate
assets/js/stages.js         monta le scene vicine allo schermo e SPEGNE quelle lontane (max poche accese)
assets/js/three/core.js     motore comune: renderer, ambiente riflesso, ciclo, p ammorbidito, destroy()
assets/js/three/materials.js  argento vivo, oro, bambù, grafite, vetro, resina cristallo, glow + texture
assets/js/three/logo-shape.js logo ricostruito in vettoriale (3 pezzi a 120°)
assets/js/three/*-scene.js  le scene (vedi §4)
assets/img/                 logo SVG, favicon, foto lavori (640 px da Instagram, .webp)
SPEC.md                     capitolato: fatti, palette, contratto delle scene, TEMPI (p) di ogni sezione (§5, §7)
dev/serve.py                anteprima senza cache:  python dev/serve.py 8790  → http://localhost:8790/
dev/scene.html              prova di UNA scena: dev/scene.html?name=tech&p=0.45&hud=0 (&theme=light)
dev/shot.sh                 foto di una pagina con Chrome headless (solo pagine senza scroll)
dev/sheet.py + snap.mjs     foglio provini con Puppeteer (anche pagina intera fatta scorrere):
                            python dev/sheet.py dev/shots/x.png 1440,900 4 "index.html@macchina:0.35|etichetta" ...
                            (serve: cd dev && npm i puppeteer-core@23 — già installato in dev/node_modules)
_ricerca/                   materiale raccolto (foto originali, logo ingrandito, dati del logo)
docs/stato-26-09.png        foglio provini dello stato attuale
```

## 4. Stato delle scene 3D (26/09/2026 ore 13)

| scena | sezione | stato |
|---|---|---|
| intro-scene.js | #intro (logo, mission/vision, 3 pilastri) | fatta e bella; i pezzi esplodono anche a strati. **Da controllare:** nella pagina intera, in alto, il logo non compare nelle foto headless (animazione d'ingresso: deve andare a orologio reale, una volta sola per pagina) |
| printer-scene.js | #macchina (stampante chiusa esplosa + stampa del logo) | fatta; esplosione più generosa. Compilazione lenta in SwiftShader (ok nei browser veri) |
| works-scene.js | #lavori (sgabello Aura, scultura di cristallo, lampada Zigzig) | fatta |
| tech-scene.js | #tecnologie (hotend FDM, stampante a resina, nylon MJF) | fatta e funziona; da togliere gli avvisi `toNonIndexed(): already non-indexed` |
| visor-scene.js | card in #storia (visiera 2020 esplosa) | la scena funziona nella pagina di prova; **nella pagina intera la card resta vuota** (timeout): verificare il montaggio della card data-pin="view" |
| lab-scene.js | #laboratorio (diorama del lab che esplode a strati) | fatta e bella |
| **anatomy-scene.js** | #anatomia | **MANCA** (SPEC §7.1) — la sezione HTML c'è, mostra il ripiego |
| **audience-scene.js** | #perchi | **MANCA** (SPEC §7.3) — la sezione HTML c'è, mostra il ripiego |

Pagina: tutte le sezioni del §7 sono state aggiunte (ordine e alternanza nero/bianco), illustrazioni SVG in parte.

## 5. Prossimi passi (in ordine)

1. Scrivere `anatomy-scene.js` (SPEC §7.1) e `audience-scene.js` (SPEC §7.3), seguendo lo stile delle scene esistenti
   (stesso contratto: `export async function create(ctx)` → `{scene, camera, update(state), resize, dispose}`).
2. Sistemare: logo in alto nella pagina intera; card visiera in #storia; avvisi di tech-scene.
3. Controllo completo con i fogli provini: ogni sezione e ogni passo, desktop 1440×900 e telefono 390×844,
   anche `?lang=en`; niente testo sopra il 3D, niente oggetti tagliati; illustrazioni SVG complete (§7.6).
4. Immagine di anteprima `assets/img/og.jpg` (1200×630, logo cromato su nero + titolo), README aggiornato.
5. Pubblicare: `gh repo create sagardelledonne/tillverka --public`, push su main, Pages con Source = GitHub Actions
   (`gh api -X POST repos/sagardelledonne/tillverka/pages -f build_type=workflow`); **chiedere prima a Sagar**.
6. Domande aperte per Nicholas: il 392 632 3799 è anche WhatsApp? foto originali in alta risoluzione? dominio
   (tillverka.xyz oggi non funziona)? va bene la bozza di mission/vision?

## 6. Come lavorare con Sagar

Non è un programmatore: spiegazioni semplici, in italiano, senza gergo, un passo alla volta; fargli vedere immagini
del risultato. Vuole la massima qualità ("capolavoro", "tante esplosioni"). Attenzione ai consumi: sul suo piano Pro
tanti agenti in parallelo hanno esaurito il limite più volte → salvare subito i file e procedere a pezzi.
