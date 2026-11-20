#!/usr/bin/env node
/**
 * Tải + tối ưu tài nguyên CC0 từ Poly Haven (https://polyhaven.com, giấy phép CC0).
 *
 *   npm run assets
 *
 * - Model: tải bản glTF 1k → giảm đa giác, thu texture về ≤512 px (webp), nén meshopt
 *   → public/models/env/<id>.glb
 * - Texture: tải bộ diff/nor_gl/rough 1k → public/textures/<tên>_*.jpg
 * Chạy lại an toàn: file đã có thì bỏ qua (xóa đi để tải lại).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'assets-src', 'polyhaven');
const OUT_MODELS = join(ROOT, 'public', 'models', 'env');
const OUT_TEX = join(ROOT, 'public', 'textures');
const UA = { 'User-Agent': 'threejs-movement-demo-asset-script' };

/** id Poly Haven → tỉ lệ giữ lại số tam giác khi giảm đa giác. */
const MODELS = {
  rock_07: 0.15,
  rock_09: 0.15,
  stone_01: 0.06,
  rock_moss_set_01: 0.12,
  tree_stump_01: 0.12,
  dead_tree_trunk: 0.05,
  fern_02: 1,
  shrub_03: 0.5,
  shrub_04: 0.2,
  wooden_crate_01: 1,
  wine_barrel_01: 0.6,
  stone_fire_pit: 1,
};

/** id texture Poly Haven → tên lưu trong public/textures. */
const TEXTURES = {
  weathered_plank_siding: 'wall_planks',
  plastered_stone_wall: 'wall_plaster',
  clay_roof_tiles_02: 'roof_tiles',
  roof_slates_02: 'roof_slates',
  stone_wall: 'stone',
  dark_wooden_planks: 'beam',
};

async function json(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function download(url, file) {
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function gltfTransform(...args) {
  const bin = join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform',
  );
  execFileSync(bin, args, { stdio: 'pipe', shell: process.platform === 'win32' });
}

for (const [id, ratio] of Object.entries(MODELS)) {
  const out = join(OUT_MODELS, `${id}.glb`);
  if (existsSync(out)) {
    console.log(`✓ ${id} (đã có)`);
    continue;
  }
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  const gltf = files.gltf['1k'].gltf;
  const dir = join(SRC, id);
  const main = join(dir, `${id}.gltf`);
  await download(gltf.url, main);
  for (const [rel, info] of Object.entries(gltf.include)) await download(info.url, join(dir, rel));

  mkdirSync(OUT_MODELS, { recursive: true });
  const args = [
    'optimize',
    main,
    out,
    '--compress',
    'meshopt',
    '--texture-compress',
    'webp',
    '--texture-size',
    '512',
  ];
  if (ratio < 1)
    args.push('--simplify', 'true', '--simplify-ratio', String(ratio), '--simplify-error', '0.002');
  else args.push('--simplify', 'false');
  gltfTransform(...args);
  console.log(`✓ ${id} → ${out}`);
}

for (const [id, name] of Object.entries(TEXTURES)) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  for (const [map, suffix] of [
    ['Diffuse', 'diff'],
    ['nor_gl', 'nor_gl'],
    ['Rough', 'rough'],
  ]) {
    const entry = files[map]?.['1k']?.jpg;
    if (!entry) throw new Error(`${id}: thiếu ${map}`);
    await download(entry.url, join(OUT_TEX, `${name}_${suffix}.jpg`));
  }
  console.log(`✓ texture ${id} → ${name}_*`);
}
console.log('Xong.');
