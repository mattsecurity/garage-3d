// The garage. Pure data (no three.js import) so Node scripts can read it too.
// forward: which axis the nose points to in the source file. length: real car length in metres.
// wheelPattern: matches the name of each wheel mesh or one of its ancestors (three.js turns spaces into "_").
// paintPattern: material name(s) that can be recoloured; null when the livery is a texture.
// bodyPattern (optional): extra materials that belong to the body shell in the kit but are not recoloured.
// credit.licenseUrl: link to the licence text, or null when the licence is unverified (Ferrari 458).
// maxTextureSize (optional): cap for texture width/height when compressing; default 2048.

export const CARS = [
  {
    id: 'ferrari-458',
    name: 'Ferrari 458 Italia',
    year: 2009,
    file: 'models/ferrari-458.glb',
    sourceUrl: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb',
    forward: '-z',
    length: 4.53,
    wheelPattern: /^wheel_(fl|fr|rl|rr)$/i,
    paintPattern: /^Body_Color$/i,
    credit: {
      title: 'Ferrari 458 Italia',
      author: 'vicent091036 (dagli esempi di three.js)',
      license: 'licenza originale non verificata',
      url: 'https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf',
      licenseUrl: null,
    },
  },
  {
    id: 'corvette-c8',
    name: 'Chevrolet Corvette C8 Stingray',
    year: 2019,
    file: 'models/corvette-c8.glb',
    sourceUrl:
      'https://media.githubusercontent.com/media/Sultan-Sovetov/Draxler/main/public/car-models/chevrolet/2019_chevrolet_corvette_c8_stingray.glb',
    forward: '-z',
    length: 4.63,
    wheelPattern: /^(Front|Rear)[\s_](Left|Right)[\s_]Wheel/i,
    paintPattern: /^Body_Color$/i,
    credit: {
      title: '2019 Chevrolet Corvette C8 Stingray',
      author: 'Hari',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/2019-chevrolet-corvette-c8-stingray-790c40ccff6843eab0b7b4bd18421ff8',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'mclaren-p1',
    name: 'McLaren P1',
    year: 2013,
    file: 'models/mclaren-p1.glb',
    sourceUrl: 'https://media.githubusercontent.com/media/pramodh7860/TuneX/main/assets/mclaren_p1__www.vecarz.com.glb',
    forward: '+z',
    length: 4.59,
    wheelPattern: /^(Rim_|Tyre_|Brake_Disk_)(LF|RF|LR|RR)/i,
    paintPattern: /^Carpaint$/i,
    credit: {
      title: 'McLaren P1 | www.vecarz.com',
      author: 'vecarz',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/mclaren-p1-wwwvecarzcom-adae2edc721e4ce7b31c1d06a581e30a',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'huracan-evo',
    name: 'Lamborghini Huracán EVO',
    year: 2019,
    file: 'models/huracan-evo.glb',
    sourceUrl:
      'https://media.githubusercontent.com/media/eskopelitis/CarShowcase/main/assets/Lamborghini/2019_lamborghini_huracan_evo.glb',
    forward: '-z',
    length: 4.52,
    wheelPattern: /^(Meshestyremichelind\d|MesheswheelAc\d)/i,
    paintPattern: /^Huracan_EVO_Paint$/i,
    credit: {
      title: '2019 Lamborghini Huracán EVO',
      author: 'adrianaflak09',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/2019-lamborghini-huracan-evo-71b4b185956d466689ad6edf759ec8b4',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'gtr-r35',
    name: 'Nissan GT-R R35',
    year: 2017,
    file: 'models/gtr-r35.glb',
    sourceUrl: 'https://media.githubusercontent.com/media/eskopelitis/CarShowcase/main/assets/Nissan/nissan_skyline_gtr_r35.glb',
    forward: '+z',
    length: 4.71,
    wheelPattern: /^(r35_wheel_05a_20x11|3_Wheel)/i,
    paintPattern: /^r35_paint$/i,
    credit: {
      title: 'Nissan Skyline GTR r35',
      author: 'Black Snow',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/nissan-skyline-gtr-r35-7b142ea3376e4811a326256c59bbc7a2',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'mclaren-mp45',
    name: 'McLaren MP4/5',
    year: 1989,
    file: 'models/mclaren-mp45.glb',
    sourceUrl: 'https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/models/vehicles/mclaren-mp4-5.glb',
    forward: '+z',
    length: 4.45,
    wheelPattern: /^(front_wheels|back_wheels)/i,
    paintPattern: null,
    bodyPattern: /^body_mat$/i,
    maxTextureSize: 1024,
    credit: {
      title: 'McLaren MP4/5 | www.vecarz.com',
      author: 'vecarz',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/mclaren-mp45-wwwvecarzcom-b0db423a98584469a73ad9b5df2ab969',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'mclaren-mcl39',
    name: 'McLaren MCL39',
    year: 2025,
    file: 'models/mclaren-mcl39.glb',
    sourceUrl: 'https://raw.githubusercontent.com/SpeedHQ/RaceIQ/main/assets/models/source/f1_2025_mclaren_mcl39.glb',
    forward: '+z',
    length: 5.2, // the model's proportions with the 2 m maximum width
    wheelPattern: /^(front_tire|rear_tire|front_wheel_windlet)/i, // one mesh per axle, split left/right on load
    paintPattern: null,
    bodyPattern: /^(main_body|front_wing|rear_wing|headrest)$/i,
    maxTextureSize: 512, // 38 textures: 1024 px would take ~210 MB of GPU memory (~53 MB now)
    credit: {
      title: 'F1 2025 McLaren MCL39',
      author: 'shunqi',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/f1-2025-mclaren-mcl39-c6194270002b401bb25be7e35ab56e34',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'redbull-rb22',
    name: 'Red Bull RB22',
    year: 2026,
    file: 'models/redbull-rb22.glb',
    sourceUrl: 'https://raw.githubusercontent.com/gabydomingo/f1-data/main/f1-telemetry-web/public/models/f1_rb22.glb',
    forward: '+z',
    length: 5.27, // the source is already in metres
    wheelPattern: /^(TYRE_(LF|RF|LR|RR)|wheel_(fl|fr|bl|br)|disc_(fl|fr|bl|br)|hub_caliper_(fl|fr|bl|br))/i,
    paintPattern: null,
    bodyPattern: /^(chasis|chassis2)/i,
    credit: {
      title: '2026 Red Bull Racing RB22',
      author: 'Dave Love (Tyler_Dave)',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/2026-red-bull-racing-rb22-8e5a68a7991c4a46bd66a879c060b3c5',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
  {
    id: 'mini-cooper-s',
    name: 'Mini Cooper S',
    year: 1967,
    file: 'models/mini-cooper-s.glb',
    sourceUrl:
      'https://media.githubusercontent.com/media/Hamza-pn/highway-racer-/main/Assets/new%20car%20models/mini_cooper_s.glb',
    forward: '+z',
    length: 3.05,
    wheelPattern: /^WheelFL/i, // all four wheels are named WheelFL, WheelFL.001… in the source
    paintPattern: /^(Body|BodyObves)$/i,
    bodyPattern: /^Roof$/i,
    maxTextureSize: 512, // ~80 textures after dedup: 1024 px would take ~450 MB of GPU memory
    credit: {
      title: 'Mini Cooper S',
      author: 'kowalski_30',
      license: 'CC-BY-4.0',
      url: 'https://sketchfab.com/3d-models/mini-cooper-s-f4eaecb588254bfabf295fedfdf01775',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    },
  },
];

/** @param {string} id */
export function getCar(id) {
  return CARS.find((c) => c.id === id) ?? null;
}
