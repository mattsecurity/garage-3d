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

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * The palette recolours paint through material.color, which multiplies the base colour texture: a
 * textured paint (e.g. the Mini's dark green) would only get darker. Split such a texture into a grey
 * shading texture (baked details, ≤ 1) and a flat colour in baseColorFactor, so colour × shade ≈ original.
 */
async function splitTexturedPaint(doc, paintPattern) {
  for (const material of doc.getRoot().listMaterials()) {
    const texture = material.getBaseColorTexture();
    if (!texture || !paintPattern?.test(material.getName())) continue;
    const { data, info } = await sharp(texture.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const rgb = new Float32Array(n * 3);
    const luma = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) rgb[i * 3 + c] = toLinear(data[i * 3 + c] / 255);
      luma[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
    }
    // Shade 1 = the bright end of the paint (90th percentile), so baked shadows stay below 1.
    const ref = Float32Array.from(luma).sort()[Math.floor(n * 0.9)] || 1;
    const grey = Buffer.alloc(n);
    const sum = [0, 0, 0];
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const s = Math.min(luma[i] / ref, 1);
      grey[i] = Math.round(toSrgb(s) * 255);
      for (let c = 0; c < 3; c++) sum[c] += rgb[i * 3 + c] * s;
      sumSq += s * s;
    }
    const factor = material.getBaseColorFactor();
    material.setBaseColorFactor([0, 1, 2].map((c) => (factor[c] * sum[c]) / sumSq).concat(factor[3]));
    const png = await sharp(grey, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
    // A new texture, in case the original is shared with a material that is not paint.
    material.setBaseColorTexture(doc.createTexture(`${material.getName()}_shade`).setImage(png).setMimeType('image/png'));
  }
}

/** Sketchfab exports often carry single-colour textures at full size: 4×4 looks the same and saves GPU memory. */
async function shrinkFlatTextures(doc) {
  for (const texture of doc.getRoot().listTextures()) {
    const { channels } = await sharp(texture.getImage()).stats();
    if (!channels.every((c) => c.stdev < 1)) continue;
    const png = await sharp(texture.getImage()).resize(4, 4, { fit: 'fill' }).png().toBuffer();
    texture.setImage(png).setMimeType('image/png');
  }
}

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
  await splitTexturedPaint(doc, car.paintPattern);
  await shrinkFlatTextures(doc);
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
