import * as THREE from 'three';
import { CONFIG } from '@/config';
import type { Box } from '@/physics/collision';
import { distanceToSegment } from '@/utils/math';
import {
  createCrate,
  createHouse,
  createWell,
  houseHeight,
  WELL_RADIUS,
  type HouseOptions,
} from './props/buildings';
import {
  bush,
  instantiate,
  pineTree,
  ROCK_HALF_WIDTH,
  ROCK_TOP,
  rock,
  roundTree,
  type PropInstance,
} from './props/nature';

export interface MapBuild {
  root: THREE.Group;
  colliders: Box[];
  aimTargets: THREE.Object3D[];
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

const WALL_COLORS = [0xe6d5b3, 0xc9a27a, 0xd8c3a0, 0xb88a5e];
const ROOF_COLORS = [0x8e3b2f, 0x5b4636, 0x3f5e7a, 0x6e2f2a];
/** Collider cao hơn mức nhảy → không trèo lên được. */
const SOLID_TOP = 20;

/**
 * Bản đồ làng trong rừng: bãi đất trống + giếng ở giữa, các nhà xếp vòng quanh
 * có đường đất dẫn vào, rừng cây/đá/bụi rải ngẫu nhiên (theo seed) xung quanh.
 */
export function buildForestMap(rand: () => number): MapBuild {
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

  // ---- Bãi đất giữa làng + giếng ----
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(F.plazaRadius, 40).rotateX(-Math.PI / 2),
    groundDecalMaterial(0x9c7b52),
  );
  plaza.receiveShadow = true;
  root.add(plaza);

  root.add(createWell());
  addCollider(0, 0, WELL_RADIUS, WELL_RADIUS, SOLID_TOP);

  // ---- Nhà xếp vòng quanh, cửa hướng vào giữa ----
  for (let i = 0; i < F.houseCount; i++) {
    const angle = (i / F.houseCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const dist = F.houseRing + rand() * 5;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;

    const opts: HouseOptions = {
      width: 5 + rand() * 2,
      depth: 4.5 + rand() * 1.5,
      wallHeight: 2.6 + rand() * 0.5,
      roofHeight: 1.8 + rand() * 0.6,
      wallColor: pick(WALL_COLORS),
      roofColor: pick(ROOF_COLORS),
    };
    // Xoay cho cửa (+Z cục bộ) nhìn về tâm, làm tròn tới 90° để collider vẫn là hộp thẳng trục.
    const yaw = Math.round((angle + Math.PI) / (Math.PI / 2)) * (Math.PI / 2);
    const house = createHouse(opts);
    house.position.set(x, 0, z);
    house.rotation.y = yaw;
    root.add(house);

    const sideways = Math.abs(Math.sin(yaw)) > 0.5;
    const hx = (sideways ? opts.depth : opts.width) / 2 + 0.2;
    const hz = (sideways ? opts.width : opts.depth) / 2 + 0.2;
    houseRects.push(addCollider(x, z, hx, hz, houseHeight(opts)));

    // Đường đất từ bậc cửa tới mép bãi trống.
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const doorX = x + fx * (opts.depth / 2 + 0.9);
    const doorZ = z + fz * (opts.depth / 2 + 0.9);
    const toCenter = Math.hypot(doorX, doorZ);
    const endX = (doorX / toCenter) * (F.plazaRadius - 0.5);
    const endZ = (doorZ / toCenter) * (F.plazaRadius - 0.5);
    paths.push({ ax: doorX, az: doorZ, bx: endX, bz: endZ });
    root.add(createPath(doorX, doorZ, endX, endZ, F.pathWidth));

    // Vài thùng gỗ cạnh nhà (nhảy lên được).
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const side = rand() < 0.5 ? -1 : 1;
    const crateCount = 1 + Math.floor(rand() * 2);
    for (let c = 0; c < crateCount; c++) {
      const size = 0.75 + rand() * 0.35;
      const cx = x + rx * side * (opts.width / 2 + 1.0) + fx * (opts.depth / 2 - 0.6 - c * 1.2);
      const cz = z + rz * side * (opts.width / 2 + 1.0) + fz * (opts.depth / 2 - 0.6 - c * 1.2);
      const crate = createCrate(size);
      crate.position.set(cx, 0, cz);
      crate.rotation.y = yaw;
      root.add(crate);
      addCollider(cx, cz, size / 2, size / 2, size);
    }
  }

  // ---- Rừng ----
  const isFree = (x: number, z: number, clearance: number): boolean => {
    const limit = CONFIG.world.size - 1;
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;
    if (Math.hypot(x, z) < F.plazaRadius + clearance) return false;
    for (const r of houseRects) {
      if (
        x > r.minX - clearance - 1 &&
        x < r.maxX + clearance + 1 &&
        z > r.minZ - clearance - 1 &&
        z < r.maxZ + clearance + 1
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

  const scatter = (count: number, clearance: number, spacing: number, taken: PropInstance[]) => {
    const out: PropInstance[] = [];
    const size = CONFIG.world.size;
    for (let attempt = 0; out.length < count && attempt < count * 8; attempt++) {
      const x = (rand() * 2 - 1) * size;
      const z = (rand() * 2 - 1) * size;
      if (!isFree(x, z, clearance)) continue;
      if (spacing > 0 && taken.some((t) => Math.hypot(t.x - x, t.z - z) < spacing)) continue;
      const item = { x, z, scale: 0.8 + rand() * 0.6, rotY: rand() * Math.PI * 2, tint: rand() };
      out.push(item);
      taken.push(item);
    }
    return out;
  };

  const trees: PropInstance[] = [];
  const treeItems = scatter(F.treeCount, 2.5, F.treeSpacing, trees);
  const pines = treeItems.filter(() => rand() < F.pineRatio);
  const rounds = treeItems.filter((t) => !pines.includes(t));
  for (const t of treeItems) addCollider(t.x, t.z, 0.3 * t.scale, 0.3 * t.scale, SOLID_TOP);

  const rocks = scatter(F.rockCount, 1.5, 2, trees);
  for (const r of rocks) {
    const h = ROCK_HALF_WIDTH * r.scale;
    addCollider(r.x, r.z, h, h, ROCK_TOP * r.scale);
  }
  const bushes = scatter(F.bushCount, 0.8, 0, []);

  const instanced = [
    ...instantiate(pineTree(), pines),
    ...instantiate(roundTree(), rounds),
    ...instantiate(rock(), rocks),
    ...instantiate(bush(), bushes),
  ];
  root.add(...instanced);

  // Tâm ngắm trúng được mọi mesh trong bản đồ.
  const aimTargets: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) aimTargets.push(obj);
  });

  return { root, colliders, aimTargets };
}

/** Vật liệu phẳng dán trên mặt đất, đẩy lên trước để không nhấp nháy (z-fighting). */
function groundDecalMaterial(color: number, layer = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer,
  });
}

function createPath(ax: number, az: number, bx: number, bz: number, width: number): THREE.Mesh {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2),
    groundDecalMaterial(0x8f6f48, 1), // dưới lớp bãi đất ở chỗ chồng nhau
  );
  mesh.position.set((ax + bx) / 2, 0, (az + bz) / 2);
  mesh.rotation.y = Math.atan2(dx, dz);
  mesh.receiveShadow = true;
  return mesh;
}
