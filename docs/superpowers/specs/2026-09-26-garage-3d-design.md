# Garage 3D — Design

Data: 2026-09-26
Riferimento: https://lab.patrickheintzmann.com/demo/demoFormula

## Obiettivo

Sito web 3D che replica le tre modalità della demo "Formula" di Patrick Heintzmann
(Kit / Drive / Studio) usando modelli 3D di auto sportive reali esistenti,
scaricati gratuitamente da fonti pubbliche con licenza compatibile con un uso
personale / portfolio (CC0 o CC-BY con attribuzione).

Uso: personale / portfolio, non commerciale. Nomi reali delle auto ammessi.

## Stack

- Vite (build statica)
- three.js 0.186 (rendering, GLTFLoader + DRACOLoader con decoder inclusi nel bundle via `DRACO_GLTF_CONFIG`)
- @dimforge/rapier3d-compat (fisica, `DynamicRayCastVehicleController`)
- GSAP (transizioni tra modalità, animazione montaggio)
- Vitest (unit test sulla logica pura)
- gltf-transform CLI (compressione modelli non compressi o > 10 MB)

JavaScript vanilla (ES modules), niente framework UI.

## Architettura

```
scripts/
  fetch-models.mjs   scarica i 6 GLB del catalogo e li comprime (Draco + WebP) in public/models/
src/
  main.js            bootstrap, render loop, macchina a stati delle modalità, cambio auto
  core/
    renderer.js      WebGLRenderer, Neutral tone mapping, ombre PCF, environment (RoomEnvironment)
    camera.js        viste per modalità, posa "home" dell'auto, transizioni GSAP (testata)
    loader.js        GLTFLoader + DRACOLoader con progresso
  cars/
    catalog.js       dati puri: url, orientamento, lunghezza, regex ruote/vernice, crediti (testata)
    garage.js        carica e mette in cache le auto
    CarModel.js      normalizza scala/orientamento, costruisce i pezzi, vernice, look "kit" (testata)
    parts.js         logica pura: mesh → pezzi del kit (testata)
    split.js         logica pura: divide una mesh-asse in ruota sx/dx/semiasse (testata)
  kit/
    packing.js       logica pura: orientamento in piano, bin-packing, griglia stampate (testata)
    sprue.js         geometria delle stampate
    Kit.js           layout del kit + animazioni montaggio/smontaggio
  physics/
    driving.js       parametri veicolo + input → comandi ruote (testata)
    Physics.js       mondo Rapier, veicolo a raggi, attrezzi urtabili (testata)
  input/
    controls.js      tastiera + mappatura tasti/joystick → input guida (testata)
    joystick.js      joystick virtuale mobile
  world/
    textures.js      texture generate su canvas (tappetino, righello, etichette, gradienti)
    props.js         attrezzi procedurali (barattoli, taglierino, forbici, ...)
    Desk.js          tavolo, tappetino, attrezzi, luce diurna
    Effects.js       segni gomme + fumo
    Studio.js        pavimento a specchio, faretti, cubetti e scie
  modes/
    KitMode.js  DriveMode.js  StudioMode.js
  ui/
    hud.js           titolo, suggerimenti, barra modalità, tavolozza, crediti, caricamento, errori
    curtain.js       dissolvenza nera per il cambio scena desk ↔ studio
```

Flusso: `catalog` → `CarModel` (istanza per auto, in cache dopo il primo
caricamento) → la modalità attiva riceve un contesto condiviso (`ctx`: scena,
camera, auto, kit, fisica, HUD...) e implementa `enter(prev)`, `exit(next)`,
`update(dt)`, `onCarChanged(car)`. Il cambio modalità chiama exit della modalità
corrente e poi enter della nuova (animazioni GSAP). Il cambio auto carica il GLB
(se non in cache) e ricostruisce kit/fisica per la modalità attiva.

Convenzioni: spazio auto con muso +Z, alto +Y, sinistra +X, ruote a terra a y = 0.
A riposo l'auto è ruotata di 180° (muso verso -Z, lontano dalla camera) così W
porta l'auto "in su" sullo schermo. Le stampate del kit sono figlie della radice
dell'auto, quindi le pose del kit sono nello spazio auto.

## Modalità Kit

1. **Classificazione pezzi** (`parts.js`): le mesh delle ruote (regex del
   catalogo sul nome della mesh o di un antenato) diventano 4 pezzi, uno per
   angolo. Le altre vanno in categorie (carrozzeria = materiale vernice o
   `bodyPattern`; fari, vetri, abitacolo per parole chiave su nome/materiale;
   il resto è telaio) e ogni categoria si divide in gruppi vicini nello spazio.
   I gruppi troppo piccoli e quelli oltre il limite (10) si uniscono al telaio.
   Ogni pezzo conserva la sua posa "montata".
2. **Disposizione** (`packing.js`): ogni pezzo viene orientato in piano (asse
   più lungo lungo X), poi disposto con bin-packing a scaffale su 2–5
   stampate 5.6 × 5.2 in griglia (verificato: tutti i kit stanno nel tappetino 20 × 14).
3. **Stampate** (`sprue.js`): telaio rettangolare di tubi + canali di iniezione
   (cilindri sottili) dal telaio a ogni pezzo. Materiale plastica grigia opaca.
4. **Materiale kit**: ai materiali originali viene iniettato (`onBeforeCompile`)
   un mix verso plastica grigia opaca, comandato da un'unica uniform condivisa
   `uKit` (0 = vernice originale, 1 = plastica). Niente materiali duplicati.
5. **Montaggio** (Kit → Drive/Studio): le stampate svaniscono; ogni pezzo vola
   lungo una curva di Bézier verso la posizione montata, in sequenza sfalsata
   (telaio → carrozzeria → abitacolo → vetri → fari → ruote). Poi `uKit` sfuma
   da 1 a 0. Durata ~2.5 s.
6. **Smontaggio** (→ Kit): animazione inversa.

Scena Kit/Drive: tavolo chiaro, tappetino da taglio blu con griglia (texture
canvas generata), attrezzi decorativi (taglierino, forbici, righello, barattoli
di vernice, matita, gomma, cacciavite), tutti procedurali: nessun file extra.

## Modalità Drive

- Fisica Rapier, `DynamicRayCastVehicleController`. Telaio = box collider dal
  bounding box dell'auto; 4 ruote con sospensioni, posizioni lette dai centri
  delle mesh ruota del GLB.
- Input: WASD/frecce = gas/freno/sterzo; Spazio = freno a mano (derapata);
  R = raddrizza auto. Mobile: joystick virtuale.
- Derapata: il freno a mano toglie motore e aderenza laterale al posteriore e
  aggiunge una spinta d'imbardata verso la direzione di sterzo (i veicoli a raggi
  di Rapier da soli non sbandano). Parametri tarati in simulazione: 0→11 u/s in
  ~2 s, velocità max 11 u/s, retromarcia 6 u/s.
- Ruote visive ruotano e sterzano in base allo stato del controller.
- Effetti: segni gomme (ribbon sul tappetino, sbiadiscono nel tempo), fumo
  (sprite instanziati) quando lo slittamento supera una soglia.
- Mondo: piano tavolo + muri invisibili ai bordi; barattoli di vernice dinamici
  (urtabili), altri attrezzi statici.
- Camera: vista dall'alto obliqua con orientamento fisso che segue l'auto (90%), smorzata.
- La fisica (Rapier, ~4 MB) si carica solo al primo ingresso in Drive.

## Modalità Studio

- Sfondo nero, auto su piano riflettente (`Reflector` con fade radiale).
- Particelle: frammenti cubici + scie luminose attorno all'auto.
- Camera: orbita lenta automatica + OrbitControls utente con limiti.
- Configuratore: tavolozza con 7 colori vernice + originale. Il colore scelto
  resta in Drive. Niente colore cerchi: i materiali dei cerchi sono diversi in
  ogni modello (a volte condivisi con freni o carrozzeria). MP4/5 non ha
  tavolozza: la livrea è una texture.

## UI

Stile ispirato all'originale: font monospace con letter-spacing ampio,
etichette in box scuri, pulsanti tra parentesi quadre.

- Alto sinistra: titolo sito, istruzioni comandi.
- Basso centro: `[Kit] [Drive] [Studio]`.
- Selettore auto: `< Nome auto >` con frecce prev/next.
- Studio: pallini colore.
- Basso destra: crediti modello (autore, licenza, link) — obbligatori per CC-BY.
- Schermata di caricamento con progresso reale.

## Gestione errori

- GLB non scaricabile → messaggio "modello non disponibile", si mantiene l'auto
  precedente.
- WebGL assente → messaggio di fallback a tutto schermo.
- Rapier WASM non inizializzabile → Drive disattivato, Kit/Studio funzionano.
- Dispositivi deboli / mobile → pixelRatio max 1.5, ombre e riflesso ridotti.

## Test

- Vitest (ambiente Node): `split.js`, `parts.js`, `packing.js`, `camera.js`,
  `driving.js`, `controls.js`, `catalog.js`, `CarModel.js` (scene sintetiche) e
  `Physics.js` (Rapier gira anche in Node).
- Verifica visiva nel browser integrato: ogni modalità × ogni auto, screenshot.

## Modelli

Scaricati in `public/models/` da `npm run models` e tutti ricompressi (Draco + WebP ≤ 2048 px):
~15 MB in totale invece di ~55 MB. I file compressi vanno in git.
Crediti in `catalog.js` e mostrati in UI.

Auto selezionate: vedi sezione "Catalogo auto".

## Catalogo auto

Sei auto. File scaricati una volta e copiati in `public/models/` (niente
hotlinking: le sorgenti sono repo personali GitHub/LFS che possono sparire).

| id | Auto | Sorgente | Peso | Licenza / autore | Struttura |
|---|---|---|---|---|---|
| `corvette-c8` | Chevrolet Corvette C8 Stingray 2019 | `media.githubusercontent.com/media/Sultan-Sovetov/Draxler/main/public/car-models/chevrolet/2019_chevrolet_corvette_c8_stingray.glb` | 3.2 MB, Draco | CC-BY-4.0, Hari Prasath R | 4 ruote con pivot al mozzo, porte, frunk, trunk, `Glasses`, materiale `Body_Color` |
| `mclaren-p1` | McLaren P1 | `media.githubusercontent.com/media/pramodh7860/TuneX/main/assets/mclaren_p1__www.vecarz.com.glb` | 12.2 MB → compressione | CC-BY-4.0, vecarz | `WHEEL_LF/RF/LR/RR`, `DOOR_L/R`, finestrini, materiale `Carpaint` |
| `huracan-evo` | Lamborghini Huracán EVO 2019 | `media.githubusercontent.com/media/eskopelitis/CarShowcase/main/assets/Lamborghini/2019_lamborghini_huracan_evo.glb` | 7.6 MB → compressione | CC-BY-4.0, adrianaflak09 | 4 gomme + 4 `wheelAc` separate, pivot all'origine (ricentrare), materiali `Paint*` |
| `gtr-r35` | Nissan GT-R R35 | `media.githubusercontent.com/media/eskopelitis/CarShowcase/main/assets/Nissan/nissan_skyline_gtr_r35.glb` | 17.7 MB → compressione | CC-BY-4.0, Black Snow | 4 ruote separate (pivot all'origine, ricentrare), porte, cofano, `r35_paint` |
| `mclaren-mp45` | McLaren MP4/5 (F1, 1989) | `raw.githubusercontent.com/gkjohnson/3d-demo-data/main/models/vehicles/mclaren-mp4-5.glb` | 7.5 MB, Draco + WebP | CC-BY-4.0, vecarz | `front_wheels_7` / `back_wheels_1` per asse → divisi sx/dx da codice (triangoli per segno x del baricentro) |
| `ferrari-458` | Ferrari 458 Italia | `raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb` | 1.7 MB, Draco | Licenza originale non verificabile (autore accreditato da three.js: vicent091036). Accettato dall'utente per uso personale | `wheel_fl/fr/rl/rr`, `rim_*`, `body` (Body_Color), `glass`, `trim` |

Regole per il catalogo:
- Ogni voce definisce: nomi/regex delle ruote (4, ordine FL/FR/RL/RR), regex
  del materiale vernice, scala target (lunghezza auto normalizzata), rotazione
  di correzione dell'orientamento, colore originale, crediti (autore, licenza,
  link).
- Ruote con pivot all'origine → ricentrate sul centro del bounding box.
- Ruote fuse per asse → divise in sx/dx per segno x del baricentro dei triangoli.
- Modelli non compressi o > 10 MB → `gltf-transform optimize` (Draco + texture WebP ≤ 2048 px).
- Nessuna dipendenza da estensioni non supportate da three.js 0.186.
- Nomi e loghi delle auto sono marchi dei produttori: ammessi per uso personale
  / portfolio non commerciale.

## Fuori scopo

- Multiplayer, tempi sul giro, piste.
- Audio motore (eventuale estensione futura).
- Modelli a pagamento o che richiedono login per il download.
