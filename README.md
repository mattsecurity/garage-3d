# Garage 3D

Modellini 3D di auto sportive reali, ispirati alla demo
[Formula di Patrick Heintzmann](https://lab.patrickheintzmann.com/demo/demoFormula):

- **[Kit]**: l'auto è un kit di plastica grigia, con i pezzi ancora sulle stampate, sopra un tappetino da taglio.
- **[Drive]**: i pezzi volano al loro posto, l'auto si vernicia e la guidi sul tavolo (WASD / frecce, Spazio per derapare, R raddrizza; joystick e pulsante Drift su telefono). Ogni oggetto sul tavolo è un corpo fisico: barattoli, coni, matite e attrezzi si ribaltano, rotolano e scivolano quando li urti.
- **[Studio]**: galleria del vento a vena aperta con rullo mobile. Il flusso attorno al modello viene calcolato (flusso potenziale su griglia 3D con scia turbolenta): il fumo del pettine segue la carrozzeria, la mappa Cp colora le pressioni, e il pannello mostra Cx, area frontale, resistenza, deportanza e potenza alla velocità scelta (coefficienti indicativi). Tavolozza colori sempre disponibile.

## Avvio

Serve Node.js 22.12 o più recente.

```bash
npm install
npm run models   # scarica e comprime i modelli (servono solo se public/models/ è vuota)
npm run dev
```

Altri comandi: `npm test` (unit test), `npm run build` (sito statico in `dist/`, apribile da qualsiasi hosting),
`npm run preview` (prova la build).

## Stack

Vite · three.js · Rapier (fisica, caricata al primo Drive) · GSAP · Vitest. JavaScript senza framework.

## Crediti dei modelli 3D

| Auto | Autore | Licenza | Fonte |
|---|---|---|---|
| Ferrari 458 Italia | vicent091036 (dagli esempi di three.js) | licenza originale non verificata | [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) |
| Chevrolet Corvette C8 Stingray 2019 | Hari | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/2019-chevrolet-corvette-c8-stingray-790c40ccff6843eab0b7b4bd18421ff8) |
| McLaren P1 | vecarz | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/mclaren-p1-wwwvecarzcom-adae2edc721e4ce7b31c1d06a581e30a) |
| Lamborghini Huracán EVO 2019 | adrianaflak09 | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/2019-lamborghini-huracan-evo-71b4b185956d466689ad6edf759ec8b4) |
| Nissan GT-R R35 | Black Snow | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/nissan-skyline-gtr-r35-7b142ea3376e4811a326256c59bbc7a2) |
| McLaren MP4/5 (1989) | vecarz | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/mclaren-mp45-wwwvecarzcom-b0db423a98584469a73ad9b5df2ab969) |
| McLaren MCL39 (2025) | shunqi | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/f1-2025-mclaren-mcl39-c6194270002b401bb25be7e35ab56e34) |
| Red Bull RB22 (2026) | Dave Love (Tyler_Dave) | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/2026-red-bull-racing-rb22-8e5a68a7991c4a46bd66a879c060b3c5) |
| Haas VF-26 (2026) | Dave Love (Tyler_Dave) | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/2026-haas-vf-26-1f41e03886724bc6acd16c92402989bc) |
| Mini Cooper S | kowalski_30 | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/mini-cooper-s-f4eaecb588254bfabf295fedfdf01775) |

I modelli sono stati modificati (ricompressi con Draco + WebP; per la Mini la texture della vernice è diventata una mappa di ombreggiatura, così la tavolozza può ricolorarla). Le due F1 moderne sono ricostruzioni amatoriali, non CAD delle squadre: la MCL39 è una scocca originale dell'autore con la livrea McLaren 2025, RB22 e VF-26 sono le livree 2026 di Red Bull e Haas sulla stessa scocca di generazione precedente. Licenza CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/. Nomi e marchi delle auto appartengono ai rispettivi produttori: il progetto è pensato per uso personale / portfolio, non commerciale.
