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
- three.js (rendering, GLTFLoader + DRACOLoader/Meshopt)
- @dimforge/rapier3d-compat (fisica, `DynamicRayCastVehicleController`)
- GSAP (transizioni tra modalità, animazione montaggio)
- Vitest (unit test sulla logica pura)
- gltf-transform CLI (compressione modelli non compressi o > 10 MB)

JavaScript vanilla (ES modules), niente framework UI.

## Architettura

```
src/
  main.js            bootstrap, render loop, macchina a stati delle modalità
  core/
    renderer.js      WebGLRenderer, ACES tone mapping, ombre, environment (RoomEnvironment/HDR)
    camera.js        camere per modalità + transizioni GSAP
    loader.js        GLTF + DRACO/Meshopt + progresso di caricamento
  cars/
    catalog.js       elenco auto: url, scala, regole di riconoscimento pezzi, colori, crediti
    CarModel.js      carica GLB, normalizza scala/orientamento, classifica pezzi, gestisce vernice
    parts.js         logica pura: classificazione mesh → pezzi (testata)
  modes/
    KitMode.js       pezzi grigi su stampate generate → montaggio animato
    DriveMode.js     fisica Rapier, input tastiera + joystick touch, camera inseguimento
    StudioMode.js    sfondo scuro, pavimento riflettente, particelle, orbita
  kit/
    packing.js       logica pura: bin-packing a scaffale dei pezzi sulle stampate (testata)
    sprue.js         generazione geometria stampate (telaio + canali)
  world/
    Desk.js          tappetino da taglio (texture canvas) + attrezzi decorativi
    Effects.js       segni gomme (ribbon) + fumo (sprite instanziati)
  input/
    controls.js      logica pura: stato tasti/joystick → {throttle, steer, brake, handbrake} (testata)
    joystick.js      joystick virtuale mobile
  ui/
    hud.js           barra modalità, selettore auto, palette colori, crediti, caricamento
```

Flusso: `catalog` → `CarModel` (istanza per auto, in cache dopo il primo
caricamento) → la modalità attiva riceve `{scene, camera, car}` e implementa
`enter(prev)`, `exit(next)`, `update(dt)`. Il cambio modalità è una timeline
GSAP (exit della modalità corrente, poi enter della nuova). Il cambio auto
carica il GLB (se non in cache) e ricostruisce kit/fisica per la modalità attiva.

## Modalità Kit

1. **Classificazione pezzi** (`parts.js`): si attraversa il modello; le mesh
   vengono raggruppate in pezzi logici tramite regole sul nome (ruote, cerchi,
   pneumatici, carrozzeria, vetri, interni, alettone, luci…) definite per auto nel
   catalogo con fallback generico. Se il modello ha poche mesh, si divide per
   materiale. Ogni pezzo conserva la sua trasformazione "montata".
2. **Disposizione** (`packing.js`): ogni pezzo viene orientato in piano (asse
   più lungo orizzontale), poi disposto con bin-packing a scaffale su 2–3
   stampate rettangolari.
3. **Stampate** (`sprue.js`): telaio rettangolare di tubi + canali di iniezione
   (cilindri sottili) dal telaio a ogni pezzo. Materiale plastica grigia opaca.
4. **Materiale kit**: tutti i pezzi usano plastica grigia (`MeshStandardMaterial`,
   roughness alta, metalness 0); i materiali originali sono conservati.
5. **Montaggio** (Kit → Drive/Studio): le stampate svaniscono; ogni pezzo vola
   lungo una curva di Bézier verso la posizione montata, in sequenza sfalsata
   (carrozzeria/telaio → ruote → vetri/dettagli). Il materiale grigio sfuma verso
   quello originale. Durata ~2.5 s.
6. **Smontaggio** (→ Kit): animazione inversa.

Scena Kit/Drive: tavolo chiaro, tappetino da taglio blu con griglia (texture
canvas generata), attrezzi decorativi (taglierino, forbici, righello, barattoli
di vernice). Attrezzi: modelli CC0 se disponibili, altrimenti geometrie
procedurali semplici.

## Modalità Drive

- Fisica Rapier, `DynamicRayCastVehicleController`. Telaio = box collider dal
  bounding box dell'auto; 4 ruote con sospensioni, posizioni lette dai centri
  delle mesh ruota del GLB.
- Input: WASD/frecce = gas/freno/sterzo; Spazio = freno a mano (derapata);
  R = raddrizza auto. Mobile: joystick virtuale.
- Derapata: riduzione attrito laterale posteriore con freno a mano o a velocità
  alta in curva.
- Ruote visive ruotano e sterzano in base allo stato del controller.
- Effetti: segni gomme (ribbon sul tappetino, sbiadiscono nel tempo), fumo
  (sprite instanziati) quando lo slittamento supera una soglia.
- Mondo: piano tavolo + muri invisibili ai bordi; barattoli di vernice dinamici
  (urtabili), altri attrezzi statici.
- Camera: inseguimento dall'alto obliquo, smorzata.

## Modalità Studio

- Sfondo nero, auto su piano riflettente (`Reflector` con fade radiale).
- Particelle: frammenti cubici + scie luminose attorno all'auto.
- Camera: orbita lenta automatica + OrbitControls utente con limiti.
- Configuratore: palette colori vernice (6–8 colori + originale) e colore
  cerchi. Il colore scelto resta in Drive.

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

- Vitest su logica pura: `parts.js` (classificazione), `packing.js`
  (nessuna sovrapposizione, tutti i pezzi dentro le stampate), `controls.js`
  (mappatura input).
- Verifica visiva nel browser integrato: ogni modalità × ogni auto, screenshot.

## Modelli

Scaricati in `public/models/`; quelli non compressi o > 10 MB passano da gltf-transform.
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
