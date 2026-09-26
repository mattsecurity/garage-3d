# Garage 3D

Modellini 3D di auto sportive reali, ispirati alla demo
[Formula di Patrick Heintzmann](https://lab.patrickheintzmann.com/demo/demoFormula):

- **[Kit]**: l'auto è un kit di plastica grigia, con i pezzi ancora sulle stampate, sopra un tappetino da taglio.
- **[Drive]**: i pezzi volano al loro posto, l'auto si vernicia e la guidi sul tavolo (WASD / frecce, Spazio freno a mano, R raddrizza; joystick su telefono).
- **[Studio]**: showroom scuro con pavimento a specchio e tavolozza colori.

## Avvio

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

I modelli sono stati modificati (ricompressi con Draco + WebP). Licenza CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/. Nomi e marchi delle auto appartengono ai rispettivi produttori: il progetto è pensato per uso personale / portfolio, non commerciale.
