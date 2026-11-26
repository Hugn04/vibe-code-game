import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CONFIG } from '@/config';
import type { Box } from '@/physics/collision';
import { IS_TOUCH_DEVICE } from '@/utils/device';
import { Door, type Interactable } from './Door';
import type { MapBuild } from './ForestMap';
import { StaticBatch } from './props/batch';
import {
  BED_SIZE,
  box,
  ceilingPanel,
  curtain,
  hospitalBed,
  ivStand,
  M,
  operatingTable,
  receptionDesk,
  sign,
} from './props/hospital';
import {
  ambulance,
  bench,
  bin,
  flatTV,
  fireExtinguisher,
  fridge,
  gurney,
  lockers,
  privacyScreen,
  sanitizer,
  sinkUnit,
  vendingMachine,
  waterDispenser,
  wheelchair,
  xrayViewer,
} from './props/hospitalExtras';
import { createTreeKinds, loadGlbKind } from './props/library';
import { instantiate, kindCollider, type PropInstance, type PropKind } from './props/nature';
import { pbrMaterial, setWorldUVs } from './textures';

// ---------------------------------------------------------------------------
// Kích thước tòa nhà (m). Tâm tòa nhà ở gốc tọa độ, cửa chính nhìn về +Z.
// ---------------------------------------------------------------------------
const H = 3.6; // chiều cao mỗi tầng (sàn → sàn)
const SLAB = 0.25; // dày sàn/trần giữa 2 tầng
const LEVELS = 2;
const T = 0.2; // dày tường
const BX = 20; // nửa chiều ngang
const BZ = 13; // nửa chiều sâu
const CORR = 1.6; // nửa bề rộng hành lang
const SOLID_TOP = 30;
const DOOR = { bottom: 0, top: 2.2 };
const WINDOW = { bottom: 0.9, top: 2.4 };

// Cầu thang trong sảnh, dọc tường tây: đi lên theo hướng +Z.
const STAIR = { x0: -7.85, x1: -6.25, z0: 4.0, steps: 20, run: 0.28 };
const STAIR_TOP_Z = STAIR.z0 + STAIR.steps * STAIR.run; // 9.6
const HOLE = { x0: -7.9, x1: -6.05, z0: 3.8, z1: STAIR_TOP_Z };

/** Ô chừa trên tường. `swing` = có cánh cửa, mở về phía ±(trục vuông góc với tường). */
type Opening = {
  at: number;
  width: number;
  bottom: number;
  top: number;
  glass?: boolean;
  swing?: 1 | -1;
  double?: boolean;
  steel?: boolean;
};
const opening = (at: number, width = 1.4): Opening => ({ at, width, ...DOOR });
const door = (at: number, swing: 1 | -1, width = 1.4, extra: Partial<Opening> = {}): Opening => ({
  at,
  width,
  ...DOOR,
  swing,
  ...extra,
});
const win = (at: number, width = 1.6): Opening => ({ at, width, ...WINDOW, glass: true });

/** Thông số 1 tầng: độ cao sàn + khoảng cao collider. */
interface Level {
  y: number;
  bottom?: number;
  top: number;
}
const LEVEL: Level[] = [
  { y: 0, top: H },
  { y: H, bottom: H, top: SOLID_TOP },
];

interface HospitalAssets {
  plants: PropKind[];
  chair: PropKind;
  desk: PropKind;
  clock: PropKind;
  medbox: PropKind;
  shelves: PropKind;
  cardbox: PropKind;
  tv: PropKind;
  stool: PropKind;
  trash: PropKind;
  lamp: PropKind;
  /** Đồ đạc đợt 2 (Poly Haven), tra theo id. */
  extra: Record<string, PropKind>;
  trees: PropKind[];
  shrubs: PropKind[];
}

const env = (id: string) => `${import.meta.env.BASE_URL}models/env/${id}.glb`;

export async function loadHospitalAssets(): Promise<HospitalAssets> {
  const ids = [
    'plastic_monobloc_chair_01',
    'metal_office_desk',
    'wall_clock',
    'medical_box',
    'steel_frame_shelves_01',
    'cardboard_box_01',
    'television_02',
    'metal_stool_01',
    'trashbag',
    'street_lamp_01',
  ];
  const extraIds = [
    'vintage_crutches_01',
    'industrial_storage_cart',
    'tool_cart',
    'desk_lamp_arm_01',
    'classic_laptop',
    'clipboard',
    'binder_notebook',
    'stationery_supplies',
    'industrial_microscope',
    'chemistry_set',
    'wooden_bookshelf_worn',
    'fire_alarm',
    'dining_table',
    'plastic_container',
    'potted_plant_04',
    'metal_stool_02',
  ];
  const [plants, props, trees, shrubs, extraKinds] = await Promise.all([
    Promise.all(['potted_plant_01', 'potted_plant_02'].map((id) => loadGlbKind(env(id)))),
    Promise.all(ids.map((id) => loadGlbKind(env(id)))),
    createTreeKinds([
      { preset: 'Oak Medium', height: 11, seed: 7 },
      { preset: 'Ash Small', height: 10, seed: 19 },
      { preset: 'Aspen Small', height: 12, seed: 29 },
    ]),
    Promise.all([
      loadGlbKind(env('shrub_03'), { foliage: { from: 0.1, to: 1.2, amplitude: 0.05 } }),
      loadGlbKind(env('shrub_04'), { foliage: { from: 0.1, to: 1.2, amplitude: 0.05 } }),
    ]),
    Promise.all(extraIds.map((id) => loadGlbKind(env(id)))),
  ]);
  const extra = Object.fromEntries(extraIds.map((id, i) => [id, extraKinds[i]]));
  const [chair, desk, clock, medbox, shelves, cardbox, tv, stool, trash, lamp] = props;
  return {
    plants,
    chair,
    desk,
    clock,
    medbox,
    shelves,
    cardbox,
    tv,
    stool,
    trash,
    lamp,
    trees,
    shrubs,
    extra,
  };
}

/**
 * Bệnh viện 2 tầng đi vào được, có cầu thang và cửa mở/đóng:
 * - Tầng 1: sảnh + lễ tân, hành lang, phòng bệnh 101–104, phòng mổ, kho thuốc, phòng khám.
 * - Tầng 2: phòng bệnh 201–205, hồi sức, phòng bác sĩ, xét nghiệm, sảnh chờ có lan can.
 * - Ngoài trời: mái sảnh, biển tên, vỉa hè, bãi đỗ xe, đèn đường, cây xanh.
 */
export function buildHospitalMap(rand: () => number, a: HospitalAssets): MapBuild {
  const root = new THREE.Group();
  const colliders: Box[] = [];
  const batch = new StaticBatch();
  const extras: THREE.Object3D[] = []; // vật không gộp (biển chữ, kính, đèn, cửa)
  const doors: Door[] = [];
  const mirrors: THREE.Mesh[] = [];

  // Tường sơn trắng: giữ normal/độ nhám của vữa, bỏ màu xám của texture.
  const wallMat = pbrMaterial('wall_white', { map: null, color: 0xe9ece8, roughness: 0.8 });
  const facadeMat = pbrMaterial('facade', { color: 0xf6f4ee });
  const ceilingMat = pbrMaterial('ceiling');
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ec, roughness: 0.45 });
  const stairMat = pbrMaterial('pavement', { color: 0xe6e3dc });

  const solid = (
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    top = SOLID_TOP,
    bottom?: number,
  ) => colliders.push({ minX, maxX, minZ, maxZ, top, bottom });

  // -------------------------------------------------------------------------
  // Tường: chạy dọc trục X (tại z cố định) hoặc trục Z (tại x cố định), có cửa ra vào /
  // cửa sổ. `outward` ≠ 0 → tường ngoài (mặt ngoài ốp vữa ngoại thất).
  // -------------------------------------------------------------------------
  const wall = (
    lv: Level,
    axis: 'x' | 'z',
    fixed: number,
    from: number,
    to: number,
    openings: Opening[],
    outward = 0,
  ) => {
    const y = lv.y;
    const ops = [...openings].sort((p, q) => p.at - q.at);
    const pieces: { a: number; b: number; y0: number; y1: number }[] = [];
    let cursor = from;
    for (const o of ops) {
      const o0 = o.at - o.width / 2;
      const o1 = o.at + o.width / 2;
      if (o0 > cursor) pieces.push({ a: cursor, b: o0, y0: 0, y1: H });
      if (o.bottom > 0) pieces.push({ a: o0, b: o1, y0: 0, y1: o.bottom });
      pieces.push({ a: o0, b: o1, y0: o.top, y1: H });
      cursor = o1;
    }
    if (to > cursor) pieces.push({ a: cursor, b: to, y0: 0, y1: H });

    const place = (
      a0: number,
      a1: number,
      y0: number,
      y1: number,
      thick: number,
      offset: number,
      m: THREE.Material,
      tile: number,
    ) => {
      const len = a1 - a0;
      const mid = (a0 + a1) / 2;
      const size: [number, number, number] =
        axis === 'x' ? [len, y1 - y0, thick] : [thick, y1 - y0, len];
      const pos: [number, number, number] =
        axis === 'x'
          ? [mid, y + (y0 + y1) / 2, fixed + offset]
          : [fixed + offset, y + (y0 + y1) / 2, mid];
      batch.add(box(size, pos, m, tile));
    };

    for (const p of pieces) {
      if (outward === 0) {
        place(p.a, p.b, p.y0, p.y1, T, 0, wallMat, 2);
      } else {
        place(p.a, p.b, p.y0, p.y1, T / 2, -outward * (T / 4), wallMat, 2);
        place(p.a, p.b, p.y0, p.y1, T / 2, outward * (T / 4), facadeMat, 3);
      }
      // Nẹp tường xanh ngọc (mặt trong với tường ngoài)
      if (p.y0 === 0 && p.y1 === H) {
        const sides = outward === 0 ? [-1, 1] : [-outward];
        for (const s of sides) place(p.a, p.b, 0.9, 1.02, 0.03, s * (T / 2 + 0.012), M.stripe(), 1);
      }
    }

    for (const o of ops) {
      const o0 = o.at - o.width / 2;
      const o1 = o.at + o.width / 2;
      if (o.glass) {
        const pane = new THREE.PlaneGeometry(o.width, o.top - o.bottom);
        const cy = y + (o.top + o.bottom) / 2;
        extras.push(
          new THREE.Mesh(
            axis === 'x'
              ? pane.translate(o.at, cy, fixed)
              : pane.rotateY(Math.PI / 2).translate(fixed, cy, o.at),
            M.glass(),
          ),
        );
        place(o0, o1, o.bottom - 0.04, o.bottom, T + 0.12, 0, M.white(), 1);
        place(o0, o1, o.top, o.top + 0.06, T + 0.04, 0, M.white(), 1);
        continue;
      }
      // Khung cửa ra vào
      place(o0 - 0.08, o0, 0, o.top + 0.08, T + 0.06, 0, M.white(), 1);
      place(o1, o1 + 0.08, 0, o.top + 0.08, T + 0.06, 0, M.white(), 1);
      place(o0, o1, o.top, o.top + 0.08, T + 0.06, 0, M.white(), 1);
      if (o.swing && axis === 'x') {
        // Cánh cửa: bản lề ở mép trái (cửa đôi: thêm cánh phải), mở vào trong phòng.
        const openRot = (-o.swing * Math.PI) / 2;
        const leaves = o.double
          ? [
              { hinge: o0, w: o.width / 2, rot: 0 },
              { hinge: o1, w: o.width / 2, rot: Math.PI },
            ]
          : [{ hinge: o0, w: o.width, rot: 0 }];
        const pair: Door[] = [];
        for (const l of leaves) {
          const x0 = l.rot === 0 ? l.hinge : l.hinge - l.w;
          const d = new Door({
            hinge: new THREE.Vector3(l.hinge, y, fixed),
            width: l.w,
            height: o.top - 0.02,
            closedRot: l.rot,
            openRot,
            collider: {
              minX: x0,
              maxX: x0 + l.w,
              minZ: fixed - T / 2,
              maxZ: fixed + T / 2,
              top: lv.top,
              bottom: lv.bottom,
            },
            material: o.steel ? M.metal() : doorMat,
            handleMaterial: M.metal(),
            glassMaterial: M.glass(),
          });
          doors.push(d);
          colliders.push(d.collider);
          extras.push(d.pivot, d.trigger);
          pair.push(d);
        }
        if (pair.length === 2) {
          pair[0].partner = pair[1];
          pair[1].partner = pair[0];
        }
      }
    }

    // Va chạm: cả bức tường trừ ô cửa ra vào (cửa sổ có kính → vẫn chặn; cửa có cánh → collider riêng)
    let c = from;
    const gaps = ops.filter((o) => !o.glass);
    for (const o of [...gaps, { at: to + 1e6, width: 0 } as Opening]) {
      const end = Math.min(o.at - o.width / 2, to);
      if (end > c) {
        if (axis === 'x') solid(c, end, fixed - T / 2, fixed + T / 2, lv.top, lv.bottom);
        else solid(fixed - T / 2, fixed + T / 2, c, end, lv.top, lv.bottom);
      }
      c = o.at + o.width / 2;
    }
  };

  const roomsX = [-16, -8, 0, 8, 16];

  // ---- Tường 2 tầng ----
  for (let i = 0; i < LEVELS; i++) {
    const lv = LEVEL[i];
    // Tường ngoài
    wall(
      lv,
      'x',
      -BZ,
      -BX,
      BX,
      roomsX.flatMap((x) => [win(x - 2), win(x + 2)]),
      -1,
    );
    wall(
      lv,
      'x',
      BZ,
      -BX,
      BX,
      i === 0
        ? [win(-17), win(-11), win(-5, 3), opening(0, 4), win(5, 3), win(11), win(17)]
        : [win(-17), win(-11), win(-4.5, 3), win(0, 2), win(4.5, 3), win(11), win(17)],
      1,
    );
    for (const sx of [-1, 1]) wall(lv, 'z', sx * BX, -BZ, BZ, [win(-7), win(0), win(7)], sx);

    // Hành lang + phòng: cửa phía bắc mở vào phòng (-Z), phía nam mở vào phòng (+Z)
    wall(
      lv,
      'x',
      -CORR,
      -BX,
      BX,
      roomsX.map((x) =>
        x === 0 && i === 0 ? door(x, -1, 2, { double: true, steel: true }) : door(x, -1),
      ),
    );
    for (const x of [-12, -4, 4, 12]) wall(lv, 'z', x, -BZ, -CORR, []);
    wall(lv, 'x', CORR, -BX, -8, [door(-14, 1)]);
    wall(lv, 'x', CORR, 8, BX, [door(14, 1)]);
    for (const x of [-8, 8]) wall(lv, 'z', x, CORR, BZ, []);
    // Cột 2 bên miệng sảnh + đoạn tường ngắn
    for (const x of [-6, 6]) {
      batch.add(box([0.4, H, 0.4], [x, lv.y + H / 2, CORR], M.white()));
      solid(x - 0.2, x + 0.2, CORR - 0.2, CORR + 0.2, lv.top, lv.bottom);
    }
    for (const x of [-7, 7]) {
      batch.add(box([2, H, T], [x, lv.y + H / 2, CORR], wallMat, 2));
      solid(x - 1, x + 1, CORR - T / 2, CORR + T / 2, lv.top, lv.bottom);
    }
  }

  // ---- Sàn, sàn tầng 2 (chừa lỗ cầu thang), mái ----
  const floorRect = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    m: THREE.Material,
    tile: number,
  ) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
      .rotateX(-Math.PI / 2)
      .translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    setWorldUVs(geo, tile);
    batch.add(new THREE.Mesh(geo, m), false);
  };
  const decal = (name: string, layer: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
    pbrMaterial(name, {
      polygonOffset: true,
      polygonOffsetFactor: -layer,
      polygonOffsetUnits: -layer,
      ...extra,
    });
  const tiles = decal('floor_tiles', 2, { color: 0xf2f2ee, roughness: 0.55 });
  floorRect(-26, 26, -18, 18, 0, decal('pavement', 1), 3);
  floorRect(-BX, BX, -BZ, BZ, 0, tiles, 1.2);
  floorRect(-32, 32, 18, 44, 0, decal('asphalt', 1), 5);

  const slabRects: [number, number, number, number][] = [
    [-BX, BX, -BZ, HOLE.z0],
    [-BX, BX, HOLE.z1, BZ],
    [-BX, HOLE.x0, HOLE.z0, HOLE.z1],
    [HOLE.x1, BX, HOLE.z0, HOLE.z1],
  ];
  for (const [x0, x1, z0, z1] of slabRects) {
    batch.add(
      box([x1 - x0, SLAB, z1 - z0], [(x0 + x1) / 2, H - SLAB / 2, (z0 + z1) / 2], ceilingMat, 1.2),
    );
    floorRect(x0, x1, z0, z1, H, tiles, 1.2);
    solid(x0, x1, z0, z1, H, H - SLAB);
  }
  // Mái (trần tầng 2) + tường chắn mái
  const roofY = H * LEVELS;
  batch.add(box([BX * 2, SLAB, BZ * 2], [0, roofY - SLAB / 2, 0], ceilingMat, 1.2));
  batch.add(box([BX * 2 + 0.6, 0.4, BZ * 2 + 0.6], [0, roofY + 0.2, 0], facadeMat, 3));
  for (const [sx, sz, w, d] of [
    [0, -1, BX * 2 + 0.6, 0.3],
    [0, 1, BX * 2 + 0.6, 0.3],
    [-1, 0, 0.3, BZ * 2 + 0.6],
    [1, 0, 0.3, BZ * 2 + 0.6],
  ] as const) {
    batch.add(box([w, 0.7, d], [sx * (BX + 0.15), roofY + 0.75, sz * (BZ + 0.15)], facadeMat, 3));
  }

  // ---- Cầu thang + lan can ----
  for (let i = 0; i < STAIR.steps; i++) {
    const top = ((i + 1) * H) / STAIR.steps;
    const z0 = STAIR.z0 + i * STAIR.run;
    const z1 = z0 + STAIR.run;
    batch.add(
      box(
        [STAIR.x1 - STAIR.x0, top, STAIR.run],
        [(STAIR.x0 + STAIR.x1) / 2, top / 2, (z0 + z1) / 2],
        stairMat,
        1,
      ),
    );
    batch.add(
      box(
        [STAIR.x1 - STAIR.x0, 0.03, 0.05],
        [(STAIR.x0 + STAIR.x1) / 2, top + 0.005, z0 + 0.03],
        M.stripe(),
        1,
      ),
    );
    solid(STAIR.x0, STAIR.x1, z0, z1, top);
  }
  const rail = (
    x0: number,
    z0: number,
    y0: number,
    x1: number,
    z1: number,
    y1: number,
    height = 1.0,
  ) => {
    const len = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
    const g = new THREE.Group();
    const bar = box([0.05, 0.05, len], [0, 0, 0], M.metal());
    bar.position.set((x0 + x1) / 2, (y0 + y1) / 2 + height, (z0 + z1) / 2);
    bar.lookAt(x1, y1 + height, z1);
    g.add(bar);
    const posts = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.2) + 1);
    for (let k = 0; k < posts; k++) {
      const t = k / (posts - 1);
      g.add(
        box(
          [0.04, height, 0.04],
          [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + height / 2, z0 + (z1 - z0) * t],
          M.metal(),
        ),
      );
    }
    // Tấm kính giữa các cột
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.hypot(x1 - x0, z1 - z0), height * 0.8),
      M.glass(),
    );
    glass.position.set((x0 + x1) / 2, (y0 + y1) / 2 + height * 0.45, (z0 + z1) / 2);
    glass.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    extras.push(glass);
    batch.add(g);
  };
  const sx = STAIR.x1 + 0.1;
  rail(sx, STAIR.z0 + 0.3, 0.27, sx, STAIR_TOP_Z, H);
  solid(sx - 0.05, sx + 0.05, STAIR.z0 + 0.6, STAIR_TOP_Z, H);
  // Lan can tầng 2 quanh lỗ cầu thang
  rail(HOLE.x1, HOLE.z0, H, HOLE.x1, HOLE.z1, H);
  rail(HOLE.x0, HOLE.z0, H, HOLE.x1, HOLE.z0, H);
  solid(HOLE.x1 - 0.05, HOLE.x1 + 0.05, HOLE.z0, HOLE.z1, SOLID_TOP, H);
  solid(HOLE.x0, HOLE.x1, HOLE.z0 - 0.05, HOLE.z0 + 0.05, SOLID_TOP, H);

  // ---- Gương soi (phản chiếu thật) trên tường đông của sảnh, cả 2 tầng ----
  const mirrorRes = IS_TOUCH_DEVICE ? 512 : 1024;
  for (const lv of LEVEL) {
    const w = 1.4;
    const hgt = 1.9;
    const x = 8 - T / 2 - 0.03;
    const z = 11.4;
    const y = lv.y + 0.5 + hgt / 2;
    const mirror = new Reflector(new THREE.PlaneGeometry(w, hgt), {
      textureWidth: mirrorRes,
      textureHeight: Math.round((mirrorRes * hgt) / w),
      color: 0xd0d4d6,
      clipBias: 0.003,
    });
    mirror.position.set(x, y, z);
    mirror.rotation.y = -Math.PI / 2;
    extras.push(mirror);
    mirrors.push(mirror);
    // Khung gương
    batch.add(box([0.04, hgt + 0.12, 0.06], [x + 0.01, y, z - w / 2 - 0.03], M.white()));
    batch.add(box([0.04, hgt + 0.12, 0.06], [x + 0.01, y, z + w / 2 + 0.03], M.white()));
    batch.add(box([0.04, 0.06, w + 0.12], [x + 0.01, y - hgt / 2 - 0.03, z], M.white()));
    batch.add(box([0.04, 0.06, w + 0.12], [x + 0.01, y + hgt / 2 + 0.03, z], M.white()));
  }

  // ---- Mái sảnh + biển tên ----
  batch.add(box([9, 0.3, 4], [0, 3.35, BZ + 2], facadeMat, 3));
  for (const x of [-4, 4]) {
    batch.add(box([0.35, 3.2, 0.35], [x, 1.6, BZ + 3.6], M.white()));
    solid(x - 0.18, x + 0.18, BZ + 3.42, BZ + 3.78);
  }
  const entranceSign = sign('BỆNH VIỆN ĐA KHOA', {
    width: 8,
    height: 0.9,
    bg: '#ffffff',
    fg: '#0f5f78',
    icon: 'cross',
  });
  entranceSign.position.set(0, 3.95, BZ + 2.05);
  extras.push(entranceSign);

  // ---- Đèn trần (mọi tầng) + đèn chiếu sáng (giới hạn số lượng cho nhẹ) ----
  for (let i = 0; i < LEVELS; i++) {
    const ceilY = LEVEL[i].y + H - SLAB;
    const panels: [number, number][] = [];
    for (let x = -18; x <= 18; x += 4) panels.push([x, 0]);
    for (const x of [-4, 0, 4]) for (const z of [5, 9]) panels.push([x, z]);
    for (const x of roomsX) for (const z of [-9.5, -5]) panels.push([x, z]);
    for (const x of [-14, 14]) for (const z of [5, 9.5]) panels.push([x, z]);
    for (const [x, z] of panels) {
      const p = ceilingPanel(ceilY);
      p.position.set(x, 0, z);
      batch.add(p, false);
    }
  }
  const lightSpots: [number, number, number][] = IS_TOUCH_DEVICE
    ? [
        [-10, 0, 0],
        [10, 0, 0],
        [0, 0, 7],
        [0, 1, 0],
      ]
    : [
        [-12, 0, 0],
        [0, 0, 0],
        [12, 0, 0],
        [0, 0, 7],
        [-12, 1, 0],
        [0, 1, 0],
        [12, 1, 0],
        [0, 1, 7],
      ];
  for (const [x, lvl, z] of lightSpots) {
    const l = new THREE.PointLight(0xf4f7ff, CONFIG.hospital.lightIntensity, 18, 2);
    l.position.set(x, LEVEL[lvl].y + H - SLAB - 0.4, z);
    extras.push(l);
  }

  // ---- Đồ đạc dựng bằng code ----
  const put = (
    obj: THREE.Object3D,
    x: number,
    z: number,
    rotY = 0,
    collide?: { hx: number; hz: number; top: number },
    lvl = 0,
  ) => {
    const y = LEVEL[lvl].y;
    obj.position.set(x, obj.position.y + y, z);
    obj.rotation.y = rotY;
    batch.add(obj);
    if (collide) {
      const swap = Math.abs(Math.sin(rotY)) > 0.5;
      const hx = swap ? collide.hz : collide.hx;
      const hz = swap ? collide.hx : collide.hz;
      solid(x - hx, x + hx, z - hz, z + hz, y + collide.top, lvl > 0 ? y : undefined);
    }
  };
  const bedBox = { hx: BED_SIZE.w / 2, hz: BED_SIZE.l / 2, top: BED_SIZE.top };

  /** Phòng bệnh phía bắc: 4 giường đầu quay vào tường, rèm ngăn, cột truyền dịch. */
  const northWard = (cx: number, lvl: number, beds = [-3, -1.05, 1.05, 3]) => {
    for (const dx of beds) {
      put(hospitalBed(), cx + dx, -BZ + 1.25, 0, bedBox, lvl);
      if (rand() < 0.7) put(ivStand(), cx + dx + 0.7, -BZ + 0.7, 0, undefined, lvl);
    }
    for (const dx of [-2.05, 0, 2.05]) {
      if (beds.length < 4 && dx === 0) continue;
      const c = curtain(2.3);
      c.position.set(cx + dx, LEVEL[lvl].y, -BZ + 1.35);
      c.rotation.y = Math.PI / 2;
      batch.add(c);
    }
  };
  // Tầng 1
  for (const cx of [-16, -8, 8]) northWard(cx, 0);
  for (const x of [10.6, 13.2, 17.4]) {
    put(hospitalBed(), x, BZ - 1.25, Math.PI, bedBox);
    put(ivStand(), x - 0.7, BZ - 0.7);
  }
  put(operatingTable(H - SLAB), 0, -8, 0, { hx: 0.32, hz: 1.02, top: 0.92 });
  put(ivStand(), 1.0, -9.2);
  put(hospitalBed(), -BX + 0.8, 9, Math.PI / 2, bedBox);
  put(receptionDesk(4), 1, 5.4, 0, { hx: 2.05, hz: 0.38, top: 1.15 });
  solid(2.3, 3.05, 3.7, 5.1, 0.8);
  put(hospitalBed(), -18.2, -0.6, Math.PI / 2, bedBox);
  // Tầng 2
  for (const cx of [-16, -8, 8]) northWard(cx, 1);
  northWard(0, 1, [-2, 2]); // hồi sức: 2 giường thưa
  for (const x of [10.6, 13.2, 17.4]) {
    put(hospitalBed(), x, BZ - 1.25, Math.PI, bedBox, 1);
    put(ivStand(), x - 0.7, BZ - 0.7, 0, undefined, 1);
  }
  for (const dx of [-2, 2]) {
    // Màn hình theo dõi ở phòng hồi sức
    const mon = new THREE.Group();
    mon.add(box([0.05, 1.1, 0.05], [0, 0.55, 0], M.metal()));
    mon.add(box([0.45, 0.32, 0.06], [0, 1.25, 0], M.darkMetal()));
    put(mon, dx - 0.75, -BZ + 0.6, 0, undefined, 1);
    const scr = sign('♥ 72  SpO2 98', {
      width: 0.4,
      height: 0.26,
      bg: '#03140f',
      fg: '#35ff9a',
      glow: true,
    });
    scr.position.set(dx - 0.75, H + 1.25, -BZ + 0.64);
    extras.push(scr);
  }

  // ---- Biển chỉ dẫn ----
  const signAt = (text: string, x: number, y: number, z: number, rotY: number, opts = {}) => {
    const s = sign(text, opts);
    s.position.set(x, y, z);
    s.rotation.y = rotY;
    extras.push(s);
  };
  const doorSign = (
    text: string,
    x: number,
    z: number,
    rotY: number,
    lvl: number,
    bg = '#1f6f8b',
  ) => signAt(text, x, LEVEL[lvl].y + 2.65, z, rotY, { width: 1.7, height: 0.32, bg });
  const north = -CORR + T / 2 + 0.03;
  const south = CORR - T / 2 - 0.03;
  doorSign('PHÒNG BỆNH 101', -16, north, 0, 0);
  doorSign('PHÒNG BỆNH 102', -8, north, 0, 0);
  doorSign('PHÒNG MỔ', 0, north, 0, 0, '#b23a3a');
  doorSign('PHÒNG BỆNH 103', 8, north, 0, 0);
  doorSign('KHO THUỐC', 16, north, 0, 0, '#5a6a75');
  doorSign('PHÒNG KHÁM', -14, south, Math.PI, 0);
  doorSign('PHÒNG BỆNH 104', 14, south, Math.PI, 0);
  doorSign('PHÒNG BỆNH 201', -16, north, 0, 1);
  doorSign('PHÒNG BỆNH 202', -8, north, 0, 1);
  doorSign('HỒI SỨC', 0, north, 0, 1, '#b23a3a');
  doorSign('PHÒNG BỆNH 203', 8, north, 0, 1);
  doorSign('PHÒNG BÁC SĨ', 16, north, 0, 1, '#5a6a75');
  doorSign('XÉT NGHIỆM', -14, south, Math.PI, 1, '#6a4c93');
  doorSign('PHÒNG BỆNH 204', 14, south, Math.PI, 1);
  signAt('LỄ TÂN', 1, 2.9, 5.6, 0, { width: 1.6, height: 0.4, bg: '#0f5f78' });
  signAt('TẦNG 2 ↑', -6.9, 2.5, 3.85, 0, { width: 1.2, height: 0.3, bg: '#0f5f78' });
  for (let i = 0; i < LEVELS; i++) {
    const y = LEVEL[i].y + 2.75;
    signAt('LỐI THOÁT', -BX + T / 2 + 0.03, y, 0, Math.PI / 2, {
      width: 1.2,
      height: 0.32,
      bg: '#1d8f3a',
      glow: true,
    });
    signAt('LỐI THOÁT', BX - T / 2 - 0.03, y, 0, -Math.PI / 2, {
      width: 1.2,
      height: 0.32,
      bg: '#1d8f3a',
      glow: true,
    });
  }
  signAt('ĐANG MỔ', 0, 3.0, north, 0, {
    width: 0.9,
    height: 0.22,
    bg: '#7a0d0d',
    fg: '#ff5a5a',
    glow: true,
  });

  // ---- Đồ đạc từ model (Poly Haven, CC0) ----
  type Item = PropInstance & { kind: PropKind; collide?: number | false };
  const items: Item[] = [];
  const add = (kind: PropKind, x: number, z: number, rotY = 0, opts: Partial<Item> = {}, lvl = 0) =>
    items.push({
      kind,
      x,
      z,
      rotY,
      scale: 1,
      tint: rand(),
      collide: 1,
      ...opts,
      y: (opts.y ?? 0) + LEVEL[lvl].y,
    });
  const plant = () => a.plants[Math.floor(rand() * a.plants.length)];

  // Tầng 1 – sảnh: ghế chờ phía đông, cây, TV + đồng hồ trên tường đông
  for (let i = 0; i < 4; i++)
    for (const row of [0, 1]) add(a.chair, 4.6 + row * 1.2, 7.2 + i * 0.95, -Math.PI / 2);
  for (const [x, z] of [
    [-4.5, 12.2],
    [5.6, 12.4],
    [7.3, 2.4],
    [-19.2, 12.2],
    [19.2, 2.4],
  ] as const) {
    add(plant(), x, z, rand() * 6, { collide: 0.6 });
  }
  add(a.clock, 7.85, 5.2, -Math.PI / 2, { y: 2.5, collide: false });
  add(a.stool, 1.6, 4.6, 0);
  add(a.medbox, 2.7, 4.4, 0, { y: 0.79, collide: false });
  // Hành lang tầng 1 + 2: ghế sát tường, thùng rác
  for (const lvl of [0, 1]) {
    for (const x of [-12.8, -11.8, 3.2, 4.2, 10.8, 11.8])
      add(a.chair, x, CORR - 0.45, Math.PI, {}, lvl);
    for (const x of [-5.7, 12.8]) add(a.trash, x, -CORR + 0.45, rand() * 6, { collide: 0.7 }, lvl);
    for (const cx of [-16, -8, 8]) {
      for (const dx of [-2.05, 2.05]) add(a.medbox, cx + dx, -BZ + 0.45, 0, {}, lvl);
      add(a.chair, cx + 2.2, -6.5, Math.PI * 0.8, {}, lvl);
    }
  }
  // Phòng mổ
  add(a.shelves, -3.2, -12.5, 0);
  add(a.shelves, 3.2, -12.5, 0);
  add(a.stool, -1.1, -7.2, 0);
  add(a.medbox, 1.6, -6.4, 0.4);
  // Kho thuốc
  for (const x of [13.2, 15.4, 17.6]) add(a.shelves, x, -12.5, 0);
  for (const z of [-9.5, -7.2, -4.9]) add(a.shelves, 19.5, z, -Math.PI / 2);
  for (let i = 0; i < 7; i++)
    add(a.cardbox, 13 + rand() * 4.5, -9 + rand() * 4.5, rand() * 6, { scale: 0.8 + rand() * 0.4 });
  // Phòng khám
  add(a.desk, -14, 8.5, Math.PI);
  add(a.stool, -14, 9.6, 0);
  add(a.chair, -14.3, 7.2, 0);
  add(a.shelves, -9.6, 12.4, Math.PI);
  // Tầng 2 – sảnh chờ, phòng bác sĩ, xét nghiệm
  for (let i = 0; i < 3; i++)
    for (const row of [0, 1]) add(a.chair, 3.4 + row * 1.2, 7.4 + i * 0.95, -Math.PI / 2, {}, 1);
  for (const [x, z] of [
    [5.6, 12.4],
    [-4.5, 12.2],
    [7.3, 2.4],
  ] as const)
    add(plant(), x, z, rand() * 6, { collide: 0.6 }, 1);
  add(a.desk, 16, -9, 0, {}, 1);
  add(a.stool, 16, -10.1, 0, {}, 1);
  add(a.shelves, 19.5, -6, -Math.PI / 2, {}, 1);
  add(plant(), 19.3, -2.4, 0, { collide: 0.6 }, 1);
  for (const x of [-17, -14, -11]) add(a.desk, x, 11.8, Math.PI, {}, 1);
  add(a.shelves, -19.5, 5, Math.PI / 2, {}, 1);

  // ---- Đồ đạc đợt 2: xe lăn, cáng, PCCC, rửa tay, máy nước, tủ đồ, bồn rửa, TV, poster… ----
  const X = a.extra;
  /** Đồ treo tường: đặt độ cao trước rồi gộp vào batch (không va chạm). */
  const mount = (obj: THREE.Object3D, x: number, y: number, z: number, rotY: number, lvl = 0) => {
    obj.position.y = y;
    put(obj, x, z, rotY, undefined, lvl);
  };
  const N_FACE = -CORR + T / 2; // mặt tường bắc của hành lang (phía hành lang)
  const S_FACE = CORR - T / 2; // mặt tường nam của hành lang
  const doorHalf = (x: number, lvl: number) => (x === 0 && lvl === 0 ? 1.1 : 0.8);

  for (const lvl of [0, 1]) {
    // Tay vịn dọc hành lang (chừa các ô cửa)
    const rails = (z: number, from: number, to: number, doorsX: number[]) => {
      let c = from;
      for (const dx of [...doorsX, to + 10]) {
        const end = Math.min(dx - doorHalf(dx, lvl) - 0.15, to);
        if (end - c > 0.4) {
          const len = end - c;
          const g = new THREE.Group();
          g.add(box([len, 0.06, 0.05], [0, 0.95, 0], M.wood()));
          for (let k = 0; k <= Math.floor(len / 1.4); k++) {
            g.add(
              box(
                [0.03, 0.06, 0.07],
                [-len / 2 + 0.1 + k * Math.min(1.4, len - 0.2), 0.95, -Math.sign(z) * 0.03],
                M.metal(),
              ),
            );
          }
          put(g, (c + end) / 2, z, 0, undefined, lvl);
        }
        c = dx + doorHalf(dx, lvl) + 0.15;
      }
    };
    rails(N_FACE + 0.07, -BX + 0.2, BX - 0.2, roomsX);
    rails(S_FACE - 0.07, -BX + 0.2, -8.2, [-14]);
    rails(S_FACE - 0.07, 8.2, BX - 0.2, [14]);

    // Bình rửa tay cạnh mỗi cửa phòng
    for (const x of roomsX) mount(sanitizer(), x + doorHalf(x, lvl) + 0.45, 1.3, N_FACE, 0, lvl);
    for (const x of [-14, 14]) mount(sanitizer(), x + 1.25, 1.3, S_FACE, Math.PI, lvl);
    // PCCC + chuông báo cháy ở 2 đầu hành lang
    mount(fireExtinguisher(), -18.6, 0.55, N_FACE, 0, lvl);
    mount(fireExtinguisher(), 18.6, 0.55, S_FACE, Math.PI, lvl);
    add(X.fire_alarm, -17.9, N_FACE, 0, { y: 1.5, collide: false }, lvl);
    add(X.fire_alarm, 17.9, S_FACE, Math.PI, { y: 1.5, collide: false }, lvl);
    // Máy bán nước + thùng rác phân loại
    put(vendingMachine(), -3.0, N_FACE + 0.42, 0, { hx: 0.48, hz: 0.4, top: 1.9 }, lvl);
    put(bin('medical'), 5.0, N_FACE + 0.3, 0, { hx: 0.18, hz: 0.18, top: 0.6 }, lvl);
    put(bin('general'), 5.45, N_FACE + 0.3, 0, { hx: 0.18, hz: 0.18, top: 0.6 }, lvl);
    // Sảnh: TV màn phẳng + cây nước
    mount(
      flatTV(
        lvl === 0 ? 'BỆNH VIỆN ĐA KHOA' : 'KHU ĐIỀU TRỊ NỘI TRÚ',
        'Giờ thăm bệnh: 16:00 – 20:00',
      ),
      8 - T / 2,
      1.95,
      9,
      -Math.PI / 2,
      lvl,
    );
    put(waterDispenser(), 7.55, 3.7, -Math.PI / 2, { hx: 0.18, hz: 0.18, top: 1.5 }, lvl);

    // Phòng bệnh: bồn rửa, TV, thùng rác y tế
    for (const cx of [-16, -8, 8]) {
      put(sinkUnit(), cx + 3.2, N_FACE - T, Math.PI, { hx: 0.36, hz: 0.26, top: 0.9 }, lvl);
      mount(flatTV('THỜI SỰ', 'Bản tin sức khỏe – 19:00'), cx - 2.2, 2.0, N_FACE - T, Math.PI, lvl);
      put(bin('medical'), cx - 3.4, N_FACE - T - 0.3, 0, { hx: 0.18, hz: 0.18, top: 0.6 }, lvl);
    }
    put(sinkUnit(), 9.0, S_FACE + T, 0, { hx: 0.36, hz: 0.26, top: 0.9 }, lvl);
    mount(flatTV('THỜI SỰ', 'Bản tin sức khỏe – 19:00'), 17, 2.0, S_FACE + T, 0, lvl);
  }

  // Tầng 1 – sảnh: xe lăn chờ, cây nhỏ + bìa hồ sơ trên quầy
  put(wheelchair(), 2.9, 12.0, Math.PI, { hx: 0.33, hz: 0.33, top: 1.0 });
  put(wheelchair(), 3.7, 12.0, Math.PI, { hx: 0.33, hz: 0.33, top: 1.0 });
  add(X.potted_plant_04, 2.5, 5.55, 0, { y: 1.14, collide: false });
  add(X.clipboard, 0.4, 5.5, 0.3, { y: 1.14, collide: false });
  add(X.stationery_supplies, -0.4, 5.5, 0, { y: 1.14, collide: false });
  // Hành lang: cáng đẩy
  put(gurney(), 3.6, -1.05, Math.PI / 2, { hx: 0.33, hz: 0.95, top: 0.95 });
  put(gurney(), -12, -1.05, Math.PI / 2, { hx: 0.33, hz: 0.95, top: 0.95 }, 1);
  put(wheelchair(), 10.4, -1.1, 0, { hx: 0.33, hz: 0.33, top: 1.0 }, 1);
  // Phòng bệnh 102: nạng dựa cạnh giường
  add(X.vintage_crutches_01, -10.3, -12.7, 0.3, { collide: false });
  add(X.vintage_crutches_01, 10.3, -12.7, -0.2, { collide: false }, 1);
  // Phòng mổ: xe dụng cụ, xe đẩy
  add(X.tool_cart, 1.9, -7.4, Math.PI / 2);
  add(X.industrial_storage_cart, -2.4, -3.0, 0);
  // Kho thuốc: xe kệ + thùng nhựa
  add(X.industrial_storage_cart, 14.6, -3.0, 0);
  add(X.industrial_storage_cart, 17.6, -3.0, 0);
  for (const [x, z] of [
    [13.4, -5.6],
    [13.4, -6.3],
  ] as const)
    add(X.plastic_container, x, z, 0);
  add(X.plastic_container, 13.4, -5.95, 0.1, { y: 0.43, collide: false });
  // Phòng khám: laptop, đèn bàn, hồ sơ, kệ sách, phim X-quang, bình phong, bồn rửa
  add(X.classic_laptop, -14.2, 8.4, Math.PI, { y: 0.79, collide: false });
  add(X.desk_lamp_arm_01, -13.3, 8.7, Math.PI, { y: 0.79, collide: false });
  add(X.clipboard, -14.9, 8.3, 0.4, { y: 0.79, collide: false });
  add(X.binder_notebook, -14.8, 8.75, 0, { y: 0.79, collide: false });
  add(X.wooden_bookshelf_worn, -10.6, S_FACE + T + 0.3, 0);
  mount(xrayViewer(), -BX + T / 2, 1.6, 4.4, Math.PI / 2);
  put(privacyScreen(), -18.0, 6.9, 0, { hx: 0.9, hz: 0.25, top: 1.7 });
  put(sinkUnit(), -8.5, S_FACE + T, 0, { hx: 0.36, hz: 0.26, top: 0.9 });
  put(bin('medical'), -12.4, 2.1, 0, { hx: 0.18, hz: 0.18, top: 0.6 });

  // Tầng 2 – trạm điều dưỡng ở sảnh
  put(receptionDesk(3), -1.5, 5.6, 0, { hx: 1.55, hz: 0.38, top: 1.15 }, 1);
  add(X.classic_laptop, -1.9, 5.45, Math.PI, { y: 1.14, collide: false }, 1);
  add(X.clipboard, -0.8, 5.5, 0.2, { y: 1.14, collide: false }, 1);
  add(a.stool, -1.5, 4.7, 0, {}, 1);
  // Tầng 2 – phòng xét nghiệm: kính hiển vi, bộ thí nghiệm, laptop, tủ lạnh mẫu, xe dụng cụ
  add(X.industrial_microscope, -17, 11.75, Math.PI, { y: 0.79, collide: false }, 1);
  add(X.chemistry_set, -14, 11.8, Math.PI, { y: 0.79, collide: false }, 1);
  add(X.classic_laptop, -11, 11.75, Math.PI, { y: 0.79, collide: false }, 1);
  for (const x of [-17, -14, -11]) add(X.metal_stool_02, x, 10.9, 0, {}, 1);
  put(fridge(), -19.45, 3.0, Math.PI / 2, { hx: 0.35, hz: 0.33, top: 1.75 }, 1);
  add(X.tool_cart, -9.4, 6.5, -Math.PI / 2, {}, 1);
  put(sinkUnit(), -8.5, S_FACE + T, 0, { hx: 0.36, hz: 0.26, top: 0.9 }, 1);
  // Tầng 2 – phòng bác sĩ: laptop, đèn, tủ đồ, bàn ăn trưa, kệ sách
  add(X.classic_laptop, 16, -9.1, Math.PI, { y: 0.79, collide: false }, 1);
  add(X.desk_lamp_arm_01, 16.8, -8.9, Math.PI, { y: 0.79, collide: false }, 1);
  add(X.binder_notebook, 15.2, -8.9, 0.3, { y: 0.79, collide: false }, 1);
  put(lockers(5), 12.4, -11.0, Math.PI / 2, { hx: 1.05, hz: 0.26, top: 1.85 }, 1);
  add(X.dining_table, 16.4, -4.6, 0, {}, 1);
  for (const [x, z, r] of [
    [15.6, -5.6, 0],
    [17.2, -5.6, 0],
    [15.6, -3.6, Math.PI],
    [17.2, -3.6, Math.PI],
  ] as const) {
    add(X.metal_stool_02, x, z, r, {}, 1);
  }
  add(X.wooden_bookshelf_worn, 19.6, -11.5, -Math.PI / 2, {}, 1);

  // Ngoài trời: xe cấp cứu, ghế băng, thùng rác
  put(ambulance(), 9.5, 21.6, 0, { hx: 2.75, hz: 1.08, top: 2.5 });
  for (const sx of [-1, 1]) {
    put(bench(), sx * 6.6, BZ + 2.4, 0, { hx: 0.8, hz: 0.25, top: 0.5 });
    put(bin('general'), sx * 5.2, BZ + 2.4, 0, { hx: 0.18, hz: 0.18, top: 0.6 });
  }

  // Ngoài trời: đèn đường, bụi cây trước tòa nhà, cây quanh khuôn viên
  for (const x of [-26, -14, 14, 26]) add(a.lamp, x, 17.6, Math.PI, { collide: 0.15 });
  for (let x = -18; x <= 18; x += 3) {
    if (Math.abs(x) < 6) continue;
    add(a.shrubs[Math.floor(rand() * a.shrubs.length)], x + (rand() - 0.5), BZ + 1.2, rand() * 6, {
      collide: false,
      scale: 0.8 + rand() * 0.4,
    });
  }
  const treeCount = IS_TOUCH_DEVICE ? CONFIG.hospital.mobileTreeCount : CONFIG.hospital.treeCount;
  const trees: PropInstance[] = [];
  for (let attempt = 0; trees.length < treeCount && attempt < treeCount * 20; attempt++) {
    const x = (rand() * 2 - 1) * (CONFIG.world.size - 2);
    const z = (rand() * 2 - 1) * (CONFIG.world.size - 2);
    if (Math.abs(x) < 30 && z > -22 && z < 48) continue; // chừa tòa nhà + bãi xe
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
    const kind = a.trees[Math.floor(rand() * a.trees.length)];
    const it = { x, z, rotY: rand() * 6.28, scale: 0.8 + rand() * 0.4, tint: rand() };
    trees.push(it);
    items.push({ ...it, kind, collide: false });
    solid(x - 0.35 * it.scale, x + 0.35 * it.scale, z - 0.35 * it.scale, z + 0.35 * it.scale);
  }

  // Vạch kẻ bãi đỗ xe
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  for (const zRow of [24, 36]) {
    for (let x = -27.5; x <= 27.5; x += 2.75) {
      batch.add(
        new THREE.Mesh(
          new THREE.PlaneGeometry(0.12, 5).rotateX(-Math.PI / 2).translate(x, 0, zRow),
          lineMat,
        ),
        false,
      );
    }
  }

  const byKind = new Map<PropKind, Item[]>();
  for (const it of items) {
    if (!byKind.has(it.kind)) byKind.set(it.kind, []);
    byKind.get(it.kind)!.push(it);
    if (it.collide !== false) colliders.push(kindCollider(it.kind, it, it.collide ?? 1));
  }
  for (const [kind, list] of byKind) root.add(...instantiate(kind, list, 30));

  root.add(...batch.build(), ...extras);
  M.glass().userData.cameraPassThrough = true;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material === M.glass()) mesh.castShadow = false;
  });

  const aimTargets: THREE.Object3D[] = [];
  root.traverse((o) => {
    // Vùng cảm ứng cửa: chỉ để tương tác, không chặn camera / tâm ngắm.
    if ((o as THREE.Mesh).isMesh && !o.userData.trigger) aimTargets.push(o);
  });

  return {
    root,
    colliders,
    aimTargets,
    spawn: { x: 0, z: BZ + 5, rotY: Math.PI },
    interactables: doors,
    mirrors,
    update: (dt) => doors.forEach((d) => d.update(dt)),
  };
}

export type { Interactable };
