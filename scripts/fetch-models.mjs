// Downloads every car in src/cars/catalog.js into public/models/ and compresses it
// (Draco geometry, WebP textures ≤ 2048 px, or car.maxTextureSize when set). Run: npm run models
// (add --force to redo existing files, --only=<id> to limit the run to one car).
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { CARS } from '../src/cars/catalog.js';

const PUBLIC_DIR = new URL('../public/', import.meta.url);
const force = process.argv.includes('--force');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

const exists = (url) =>
  stat(url).then(
    () => true,
    () => false,
  );

await mkdir(new URL('models/', PUBLIC_DIR), { recursive: true });
for (const car of CARS) {
  if (only && car.id !== only) continue;
  const out = new URL(car.file, PUBLIC_DIR);
  if (!force && (await exists(out))) {
    console.log(`skip ${car.id} (already downloaded)`);
    continue;
  }
  console.log(`download ${car.id}`);
  const res = await fetch(car.sourceUrl);
  if (!res.ok) throw new Error(`${car.id}: HTTP ${res.status} for ${car.sourceUrl}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength < 100_000) throw new Error(`${car.id}: only ${bytes.byteLength} bytes — a Git LFS pointer instead of the model?`);
  const doc = await io.readBinary(bytes);
  const size = car.maxTextureSize ?? 2048;
  await doc.transform(
    // Materials are left alone on purpose: merging them could rename the paint material.
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size] }),
    draco(),
  );
  const glb = await io.writeBinary(doc);
  await writeFile(out, glb);
  console.log(`  → ${fileURLToPath(out)} (${(glb.byteLength / 1e6).toFixed(2)} MB)`);
}
