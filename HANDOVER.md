# Tillverka · sito web — documento di passaggio (26/09/2026, sera)

Da leggere per primo in una nuova chat/sessione. Poi `SPEC.md` (capitolato vincolante) e `README.md`.

## 1. Il progetto in breve

- **Cliente:** Tillverka Srl, laboratorio di progettazione e stampa 3D, via Andrea Maria Ampère 122, 20131 Milano
  (Città Studi), P.IVA 10677210964.
- **Richiesta di Sagar:** un sito "capolavoro visivo" stile pagina prodotto Apple, con tante animazioni 3D guidate dallo
  scroll e **tante esplosioni** (stampante, logo, oggetti stampati), illustrazioni, qualità altissima; logo esistente
  animato; un bel focus su **mission e vision**.
- **Tecnica:** sito statico, niente build. `index.html` + CSS + moduli ES; Three.js 0.170 da jsdelivr (importmap).
  Si pubblicherà su GitHub Pages (`sagardelledonne.github.io/tillverka`), il workflow è già pronto in
  `.github/workflows/pages.yml` (pubblica solo `index.html` e `assets/`, a ogni push su `main`).
- **Repo GitHub:** `sagardelledonne/tillverka` (**privato**). `main` contiene solo lo zip caricato da Sagar; tutto il
  lavoro sta sul ramo `claude/sharp-goodall-1pnd38`. Unire su `main` = pubblicare: **solo con l'ok di Sagar**.
- **Cartella locale dell'utente:** una copia vecchia, del mattino del 26/09.
  L'utente lavora in sessioni online (cloud): il repo è la fonte di verità.

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
assets/js/three/*-scene.js  le scene (vedi §4); kit.js = attrezzi comuni di anatomy e audience
assets/img/                 logo SVG, favicon, foto lavori (640 px da Instagram, .webp)
SPEC.md                     capitolato: fatti, palette, contratto delle scene, TEMPI (p) di ogni sezione (§5, §7)
dev/serve.py                anteprima senza cache:  python dev/serve.py 8790  → http://localhost:8790/
dev/scene.html              prova di UNA scena: dev/scene.html?name=tech&p=0.45&hud=0 (&theme=light)
dev/shot.sh                 foto di una pagina con Chrome headless (solo pagine senza scroll)
dev/sheet.py + snap.mjs     foglio provini con Puppeteer (anche pagina intera fatta scorrere):
                            python dev/sheet.py dev/shots/x.png 1440,900 4 "index.html@macchina:0.35|etichetta" ...
                            (serve: cd dev && npm i puppeteer-core@23; nel cloud anche npm i --no-save three@0.170.0)
dev/an.sh                   una scena a più p:  bash dev/an.sh audience dev/shots/a.png 1440,900 4 0.1 0.5 0.9
dev/full.py                 tutta la pagina, ogni passo:  python dev/full.py dev/shots/full 390,844 [en] [sezioni]
dev/ill.py                  genera i disegni tecnici SVG e li inserisce in index.html (--preview → dev/ill.html)
dev/og.html                 pagina da cui si fotografa assets/img/og.jpg (1200×630)
_ricerca/                   materiale raccolto (foto originali, logo ingrandito, dati del logo)
docs/stato-26-09.png        foglio provini dello stato attuale
```

## 4. Stato (26/09/2026 sera)

| scena | sezione | stato |
|---|---|---|
| intro-scene.js | #intro (logo, mission/vision, 3 pilastri) | fatta; l'ingresso a orologio vero funziona anche nelle foto (logo incastrato in < 1 s) |
| printer-scene.js | #macchina (stampante chiusa esplosa + stampa del logo) | fatta |
| anatomy-scene.js | #anatomia | **fatta** (SPEC §7.1): staffa PLA argento con aletta a sbalzo, taglio con foglio di luce, esploso (4 strati di superficie a ±45°, 3 pareti concentriche, gyroid vero da surface nets, fondo, supporti ad albero bambù, brim), ristampa griglia → nido d'ape → gyroid, chiusura con bagliore che si raffredda |
| tech-scene.js | #tecnologie | fatta; avvisi `toNonIndexed` tolti |
| works-scene.js | #lavori | fatta |
| audience-scene.js | #perchi | **fatta** (SPEC §7.3): riduttore epicicloidale con dentature a evolvente vere (12/15/42) che girano ingranate, plastico a curve di livello in bambù con edificio che si apre, vaso seta verde→oro che cambia forma 3 volte ed esplode in anelli |
| visor-scene.js | card in #storia | fatta; la visiera ora sta sotto la didascalia della card |
| lab-scene.js | #laboratorio | fatta; nella vista finale dall'alto non tocca più il titolo |

Pagina: disegni tecnici SVG completi (servizi, altezze di strato 0,05/0,1/0,2 mm, Come funziona, riserve senza WebGL
per anatomia/tecnologie/per chi/visiera) generati da `dev/ill.py`; `assets/img/og.jpg` fatta (`dev/og.html`);
322 chiavi di traduzione, nessuna mancante. Controllo con i fogli provini fatto su desktop 1440×900, telefono 390×844 e
inglese (`python dev/full.py …`). Foto di riferimento dello stato: `docs/stato-26-09-sera.png`.

## 5. Prossimi passi (in ordine)

1. **Pubblicare** (Sagar ha dato l'ok il 26/09). Per GitHub Pages gratis il repo deve diventare pubblico: le note
   attuali sono già senza dati personali (le versioni vecchie nella cronologia no: vedi la chat del 26/09). Poi Sagar,
   dal sito di GitHub: Settings → General → Change visibility → Public; Settings → Pages → Source = **GitHub Actions**.
   Infine unire `claude/sharp-goodall-1pnd38` su `main` (push): il workflow pubblica in 1–2 minuti su
   `https://sagardelledonne.github.io/tillverka/`. Controllare che l'anteprima social mostri `og.jpg`.
2. Domande aperte per il cliente: il 392 632 3799 è anche WhatsApp? foto originali in alta risoluzione? dominio
   (tillverka.xyz oggi non funziona)? va bene la bozza di mission/vision? (e rilettura di testi e crediti)
3. Se arriva un dominio: aggiornare `canonical`, `og:url`, `og:image`, `hreflang` e JSON-LD in `index.html`.

## 6. Come lavorare con Sagar

Non è un programmatore: spiegazioni semplici, in italiano, senza gergo, un passo alla volta; fargli vedere immagini
del risultato. Vuole la massima qualità ("capolavoro", "tante esplosioni"). Lavorare a pezzi e salvare spesso
(commit e push dopo ogni parte), senza tanti agenti in parallelo.
