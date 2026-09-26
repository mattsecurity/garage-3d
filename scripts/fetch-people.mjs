// Downloads the people who staff the wind tunnel's control room into public/models/people/ and slims them down
// (no animations — they are posed in code — WebP textures ≤ 1024 px). Run: npm run people (add --force to redo).
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const THREE_MODELS = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/';

// dropMaterials: meshes using these materials are removed (the Ready Player Me avatar comes with a cowboy hat).
export const PEOPLE = [{ id: 'engineer', source: `${THREE_MODELS}readyplayer.me.glb`, dropMaterials: /headwear/i }];

const OUT_DIR = new URL('../public/models/people/', import.meta.url);
const force = process.argv.includes('--force');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const exists = (url) =>
  stat(url).then(
    () => true,
    () => false,
  );

await mkdir(OUT_DIR, { recursive: true });
for (const person of PEOPLE) {
  const out = new URL(`${person.id}.glb`, OUT_DIR);
  if (!force && (await exists(out))) {
    console.log(`skip ${person.id} (already downloaded)`);
    continue;
  }
  console.log(`download ${person.id}`);
  const res = await fetch(person.source);
  if (!res.ok) throw new Error(`${person.id}: HTTP ${res.status} for ${person.source}`);
  const doc = await io.readBinary(new Uint8Array(await res.arrayBuffer()));
  const root = doc.getRoot();
  for (const animation of root.listAnimations()) animation.dispose();
  if (person.dropMaterials)
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (mesh?.listPrimitives().some((p) => person.dropMaterials.test(p.getMaterial()?.getName() ?? ''))) node.setMesh(null);
    }
  await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }));
  const glb = await io.writeBinary(doc);
  await writeFile(out, glb);
  console.log(`  → ${fileURLToPath(out)} (${(glb.byteLength / 1e6).toFixed(2)} MB)`);
}
