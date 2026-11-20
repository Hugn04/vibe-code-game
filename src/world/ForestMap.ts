import * as THREE from 'three';
import { CONFIG } from '@/config';
import type { Box } from '@/physics/collision';
import { IS_TOUCH_DEVICE } from '@/utils/device';
import { distanceToSegment } from '@/utils/math';
import {
  createHouse,
  createWell,
  houseHeight,
  WELL_RADIUS,
  type HouseOptions,
} from './props/buildings';
import { createTreeKinds, loadGlbKind } from './props/library';
import { instantiate, type PropInstance, type PropKind } from './props/nature';
import { pbrMaterial, setWorldUVs } from './textures';

export interface MapBuild {
  root: THREE.Group;
  colliders: Box[];
  aimTargets: THREE.Object3D[];
}

/** Model môi trường đã tải (xem `npm run assets` và src/world/props/library.ts). */
export interface MapAssets {
  trees: PropKind[];
  rocks: PropKind[];
  logs: PropKind[];
  shrubs: PropKind[];
  crate: PropKind;
  barrel: PropKind;
  firePit: PropKind;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

interface Placed extends PropInstance {
  kind: number;
}

/** Collider cao hơn mức nhảy → không trèo lên được. */
const SOLID_TOP = 20;
const WALL_TINTS = [0xffffff, 0xf1e4cc, 0xdccab0, 0xe8e0d4];
const env = (id: string) => `${import.meta.env.BASE_URL}models/env/${id}.glb`;

/** Tải toàn bộ model của bản đồ song song. */
export async function loadMapAssets(): Promise<MapAssets> {
  const [trees, rocks, logs, shrubs, crate, barrel, firePit] = await Promise.all([
    createTreeKinds([
      { preset: 'Pine Medium', height: 15, seed: 11 },
      { preset: 'Pine Small', height: 10, seed: 23 },
      { preset: 'Oak Medium', height: 12, seed: 37 },
      { preset: 'Ash Small', height: 11, seed: 41 },
      { preset: 'Aspen Small', height: 13, seed: 53 },
    ]),
    Promise.all(
      ['rock_07', 'rock_09', 'stone_01', 'rock_moss_set_01'].map((id) => loadGlbKind(env(id))),
    ),
    Promise.all(['tree_stump_01', 'dead_tree_trunk'].map((id) => loadGlbKind(env(id)))),
    Promise.all([
      loadGlbKind(env('shrub_03'), { foliage: { from: 0.1, to: 1.2, amplitude: 0.05 } }),
      loadGlbKind(env('shrub_04'), { foliage: { from: 0.1, to: 1.2, amplitude: 0.05 } }),
      loadGlbKind(env('fern_02'), {
        foliage: { from: 0.05, to: 0.8, amplitude: 0.04 },
        castShadow: false,
      }),
    ]),
    loadGlbKind(env('wooden_crate_01')),
    loadGlbKind(env('wine_barrel_01')),
    loadGlbKind(env('stone_fire_pit')),
  ]);
  return { trees, rocks, logs, shrubs, crate, barrel, firePit };
}

/**
 * Bản đồ làng trong rừng: bãi đất trống + giếng + bếp lửa ở giữa, các nhà xếp vòng quanh
 * có đường đất dẫn vào, rừng cây/đá/gốc cây/bụi rải ngẫu nhiên (theo seed) xung quanh.
 */
export function buildForestMap(rand: () => number, assets: MapAssets): MapBuild {
  const F = CONFIG.forest;
  const root = new THREE.Group();
  const colliders: Box[] = [];
  const houseRects: Rect[] = [];
  const paths: Segment[] = [];
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  const addCollider = (x: number, z: number, hx: number, hz: number, top: number): Rect => {
    const r = { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz };
    colliders.push({ ...r, top });
    return r;
  };

  /** Collider hộp thẳng trục bao trọn model đã xoay/co giãn (shrink < 1 cho vật hình tròn). */
  const addKindCollider = (kind: PropKind, it: PropInstance, shrink = 1, top?: number) => {
    const b = kind.bounds;
    const cx = ((b.min.x + b.max.x) / 2) * it.scale;
    const cz = ((b.min.z + b.max.z) / 2) * it.scale;
    const hx = ((b.max.x - b.min.x) / 2) * it.scale * shrink;
    const hz = ((b.max.z - b.min.z) / 2) * it.scale * shrink;
    const c = Math.cos(it.rotY);
    const s = Math.sin(it.rotY);
    const wx = it.x + cx * c + cz * s;
    const wz = it.z - cx * s + cz * c;
    const ex = Math.abs(c) * hx + Math.abs(s) * hz;
    const ez = Math.abs(s) * hx + Math.abs(c) * hz;
    return addCollider(wx, wz, ex, ez, top ?? b.max.y * it.scale);
  };

  // ---- Bãi đất giữa làng: giếng + bếp lửa ----
  const plazaGeo = new THREE.CircleGeometry(F.plazaRadius, 48).rotateX(-Math.PI / 2);
  setWorldUVs(plazaGeo, 4);
  const plaza = new THREE.Mesh(plazaGeo, groundDecalMaterial());
  plaza.receiveShadow = true;
  root.add(plaza);

  root.add(createWell());
  addCollider(0, 0, WELL_RADIUS, WELL_RADIUS, SOLID_TOP);

  const fire: Placed = { x: 5.5, z: -3.5, scale: 1, rotY: 0.4, tint: 0.5, kind: 0 };
  root.add(...instantiate(assets.firePit, [fire]));
  addKindCollider(assets.firePit, fire, 0.85);

  // ---- Nhà xếp vòng quanh, cửa hướng vào giữa ----
  const props: { crate: Placed[]; barrel: Placed[] } = { crate: [], barrel: [] };
  for (let i = 0; i < F.houseCount; i++) {
    const angle = (i / F.houseCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const dist = F.houseRing + rand() * 5;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;

    const opts: HouseOptions = {
      width: 5.5 + rand() * 2,
      depth: 4.8 + rand() * 1.5,
      wallHeight: 2.7 + rand() * 0.5,
      roofHeight: 2.0 + rand() * 0.6,
      wall: rand() < 0.55 ? 'planks' : 'plaster',
      roof: rand() < 0.5 ? 'tiles' : 'slates',
      wallTint: pick(WALL_TINTS),
    };
    // Xoay cho cửa (+Z cục bộ) nhìn về tâm, làm tròn tới 90° để collider vẫn là hộp thẳng trục.
    const yaw = Math.round((angle + Math.PI) / (Math.PI / 2)) * (Math.PI / 2);
    const house = createHouse(opts);
    house.position.set(x, 0, z);
    house.rotation.y = yaw;
    root.add(house);

    const sideways = Math.abs(Math.sin(yaw)) > 0.5;
    const hx = (sideways ? opts.depth : opts.width) / 2 + 0.25;
    const hz = (sideways ? opts.width : opts.depth) / 2 + 0.25;
    houseRects.push(addCollider(x, z, hx, hz, houseHeight(opts)));

    // Đường đất từ bậc cửa tới mép bãi trống.
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const doorX = x + fx * (opts.depth / 2 + 1.0);
    const doorZ = z + fz * (opts.depth / 2 + 1.0);
    const toCenter = Math.hypot(doorX, doorZ);
    const endX = (doorX / toCenter) * (F.plazaRadius - 0.5);
    const endZ = (doorZ / toCenter) * (F.plazaRadius - 0.5);
    paths.push({ ax: doorX, az: doorZ, bx: endX, bz: endZ });
    root.add(createPath(doorX, doorZ, endX, endZ, F.pathWidth));

    // Thùng gỗ + thùng rượu cạnh nhà (nhảy lên được).
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const side = rand() < 0.5 ? -1 : 1;
    const count = 1 + Math.floor(rand() * 3);
    for (let c = 0; c < count; c++) {
      const along = opts.depth / 2 - 0.7 - c * 1.3;
      const item: Placed = {
        x: x + rx * side * (opts.width / 2 + 1.0) + fx * along,
        z: z + rz * side * (opts.width / 2 + 1.0) + fz * along,
        scale: 0.9 + rand() * 0.25,
        rotY: yaw + (rand() - 0.5) * 0.6,
        tint: rand(),
        kind: 0,
      };
      (rand() < 0.6 ? props.crate : props.barrel).push(item);
    }
  }
  root.add(...instantiate(assets.crate, props.crate), ...instantiate(assets.barrel, props.barrel));
  for (const it of props.crate) addKindCollider(assets.crate, it);
  for (const it of props.barrel) addKindCollider(assets.barrel, it, 0.85);

  // ---- Rừng ----
  const isFree = (x: number, z: number, clearance: number): boolean => {
    const limit = CONFIG.world.size - 1;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;
    if (Math.hypot(x, z) < F.plazaRadius + clearance) return false;
    for (const r of houseRects) {
      if (
        x > r.minX - clearance - 1.5 &&
        x < r.maxX + clearance + 1.5 &&
        z > r.minZ - clearance - 1.5 &&
        z < r.maxZ + clearance + 1.5
      )
        return false;
    }
    for (const s of paths) {
      if (distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz) < F.pathWidth / 2 + clearance) {
        return false;
      }
    }
    return true;
  };

  const scatter = (
    count: number,
    kinds: number,
    opts: { clearance: number; spacing: number; scale: [number, number] },
    taken: PropInstance[],
  ): Placed[] => {
    const out: Placed[] = [];
    const size = CONFIG.world.size;
    for (let attempt = 0; out.length < count && attempt < count * 10; attempt++) {
      const x = (rand() * 2 - 1) * size;
      const z = (rand() * 2 - 1) * size;
      if (!isFree(x, z, opts.clearance)) continue;
      if (opts.spacing > 0 && taken.some((t) => Math.hypot(t.x - x, t.z - z) < opts.spacing)) {
        continue;
      }
      const [s0, s1] = opts.scale;
      const item: Placed = {
        x,
        z,
        scale: s0 + rand() * (s1 - s0),
        rotY: rand() * Math.PI * 2,
        tint: rand(),
        kind: Math.floor(rand() * kinds),
      };
      out.push(item);
      taken.push(item);
    }
    return out;
  };

  const solid: PropInstance[] = [];
  const treeCount = IS_TOUCH_DEVICE ? F.mobileTreeCount : F.treeCount;
  const trees = scatter(
    treeCount,
    assets.trees.length,
    { clearance: 3, spacing: F.treeSpacing, scale: [0.8, 1.2] },
    solid,
  );
  for (const t of trees) addCollider(t.x, t.z, 0.35 * t.scale, 0.35 * t.scale, SOLID_TOP);

  const rocks = scatter(
    F.rockCount,
    assets.rocks.length,
    { clearance: 1.5, spacing: 2.5, scale: [0.6, 1.3] },
    solid,
  );
  for (const r of rocks) addKindCollider(assets.rocks[r.kind], r, 0.75);

  const logs = scatter(
    F.logCount,
    assets.logs.length,
    { clearance: 1.5, spacing: 2.5, scale: [0.8, 1.2] },
    solid,
  );
  for (const l of logs) addKindCollider(assets.logs[l.kind], l, 0.8);

  const shrubCount = IS_TOUCH_DEVICE ? Math.round(F.bushCount * 0.5) : F.bushCount;
  const shrubs = scatter(
    shrubCount,
    assets.shrubs.length,
    { clearance: 0.5, spacing: 0, scale: [0.7, 1.3] },
    [],
  );

  const place = (kinds: PropKind[], items: Placed[]) =>
    kinds.flatMap((kind, k) =>
      instantiate(
        kind,
        items.filter((it) => it.kind === k),
        F.chunkSize,
      ),
    );
  root.add(
    ...place(assets.trees, trees),
    ...place(assets.rocks, rocks),
    ...place(assets.logs, logs),
    ...place(assets.shrubs, shrubs),
  );

  // Tâm ngắm trúng được mọi mesh trong bản đồ.
  const aimTargets: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) aimTargets.push(obj);
  });

  return { root, colliders, aimTargets };
}

/** Vật liệu dán trên mặt đất, đẩy lên trước để không nhấp nháy (z-fighting). */
function groundDecalMaterial(layer = 2): THREE.MeshStandardMaterial {
  return pbrMaterial('dirt', {
    color: 0xa08d74,
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer,
  });
}

function createPath(ax: number, az: number, bx: number, bz: number, width: number): THREE.Mesh {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const geo = new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2);
  setWorldUVs(geo, 4);
  const mesh = new THREE.Mesh(geo, groundDecalMaterial(1)); // dưới lớp bãi đất ở chỗ chồng nhau
  mesh.position.set((ax + bx) / 2, 0, (az + bz) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.receiveShadow = true;
  return mesh;
}
