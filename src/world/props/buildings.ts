import * as THREE from 'three';
import { pbrMaterial } from '../textures';

/**
 * Gán UV kiểu "chiếu hộp": mỗi mặt lấy UV theo 2 trục vuông góc với pháp tuyến của nó,
 * theo đơn vị mét / `tile`. Texture giữ đúng tỉ lệ thật trên tường, mái, cột… mọi kích cỡ.
 */
export function boxProjectUVs(geometry: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Vật liệu dùng chung, tạo 1 lần cho mọi nhà. */
const cache = new Map<string, THREE.Material>();
function material(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
}
const stoneMat = () => material('stone', () => pbrMaterial('stone'));
const beamMat = () => material('beam', () => pbrMaterial('beam'));

export type WallStyle = 'planks' | 'plaster';
export type RoofStyle = 'tiles' | 'slates';

export interface HouseOptions {
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  wall: WallStyle;
  roof: RoofStyle;
  /** Màu nhân lên texture tường (trắng = giữ nguyên). */
  wallTint: number;
}

const FOUNDATION = 0.35;

/** Tổng chiều cao nhà (tới nóc mái). */
export const houseHeight = (o: HouseOptions): number => FOUNDATION + o.wallHeight + o.roofHeight;

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  mat: THREE.Material,
  tile = 1.5,
): THREE.Mesh {
  const geo = boxProjectUVs(new THREE.BoxGeometry(...size).translate(...pos), tile);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Nhà gỗ/vữa kiểu làng rừng, vật liệu PBR (Poly Haven, CC0).
 * Gốc tọa độ ở tâm sàn, cửa chính nhìn về +Z.
 */
export function createHouse(o: HouseOptions): THREE.Group {
  const g = new THREE.Group();
  const { width: w, depth: d, wallHeight: wh, roofHeight: rh } = o;
  const wallTop = FOUNDATION + wh;
  const stone = stoneMat();
  const beam = beamMat();
  const wall = material(`wall-${o.wall}-${o.wallTint}`, () =>
    pbrMaterial(o.wall === 'planks' ? 'wall_planks' : 'wall_plaster', { color: o.wallTint }),
  );
  const roofMat = material(`roof-${o.roof}`, () =>
    pbrMaterial(o.roof === 'tiles' ? 'roof_tiles' : 'roof_slates', { side: THREE.DoubleSide }),
  );
  const glass = material(
    'glass',
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffd9a0,
        emissive: 0xffb050,
        emissiveIntensity: 1.6,
        roughness: 0.15,
      }),
  );

  // Móng đá + tường
  addBox(g, [w + 0.5, FOUNDATION, d + 0.5], [0, FOUNDATION / 2, 0], stone, 1.2);
  addBox(g, [w, wh, d], [0, FOUNDATION + wh / 2, 0], wall, 2);

  // Khung gỗ: cột góc + xà ngang
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(g, [0.26, wh, 0.26], [sx * (w / 2), FOUNDATION + wh / 2, sz * (d / 2)], beam);
    }
  }
  for (const sz of [-1, 1]) {
    addBox(g, [w + 0.3, 0.24, 0.28], [0, wallTop - 0.12, sz * (d / 2)], beam);
  }

  // Mái hai dốc (hình tam giác đùn dọc trục Z)
  const overhang = 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, -0.1);
  shape.lineTo(w / 2 + overhang, -0.1);
  shape.lineTo(0, rh);
  shape.closePath();
  const roofDepth = d + overhang * 2;
  const roofGeo = boxProjectUVs(
    new THREE.ExtrudeGeometry(shape, { depth: roofDepth, bevelEnabled: false }).translate(
      0,
      wallTop,
      -roofDepth / 2,
    ),
    1.6,
  );
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);

  // Ống khói đá
  addBox(g, [0.7, rh + 0.9, 0.7], [w / 4, wallTop + (rh + 0.9) / 2, -d / 4], stone, 1.2);

  // Cửa + khung cửa + bậc thềm
  addBox(g, [1.1, 2.05, 0.1], [0, FOUNDATION + 1.03, d / 2 + 0.06], beam);
  addBox(g, [1.4, 0.18, 0.16], [0, FOUNDATION + 2.12, d / 2 + 0.08], beam);
  addBox(g, [1.7, 0.2, 0.8], [0, 0.1, d / 2 + 0.6], stone, 1.2);

  // Cửa sổ phát sáng ấm + khung gỗ
  const winY = FOUNDATION + 1.55;
  const addWindow = (pos: [number, number, number], alongX: boolean) => {
    addBox(g, alongX ? [0.9, 0.85, 0.06] : [0.06, 0.85, 0.9], pos, glass);
    const frame: [number, number, number] = alongX ? [1.1, 0.1, 0.12] : [0.12, 0.1, 1.1];
    addBox(g, frame, [pos[0], pos[1] - 0.48, pos[2]], beam);
    addBox(g, frame, [pos[0], pos[1] + 0.48, pos[2]], beam);
  };
  if (w >= 5) for (const sx of [-1, 1]) addWindow([sx * (w / 2 - 1.15), winY, d / 2 + 0.04], true);
  for (const sx of [-1, 1]) addWindow([sx * (w / 2 + 0.04), winY, 0], false);
  addWindow([0, winY, -d / 2 - 0.04], true);

  return g;
}

/** Giếng đá có mái ngói. Gốc ở tâm đáy. */
export const WELL_RADIUS = 1.1;
export function createWell(): THREE.Group {
  const g = new THREE.Group();
  const stone = stoneMat();
  const beam = beamMat();

  const ring = new THREE.Mesh(
    boxProjectUVs(new THREE.CylinderGeometry(WELL_RADIUS, 1.2, 0.9, 20), 1.2),
    stone,
  );
  ring.position.y = 0.45;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 20).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1d3b44, roughness: 0.05, metalness: 0.1 }),
  );
  water.position.y = 0.91;
  ring.castShadow = ring.receiveShadow = true;
  g.add(ring, water);

  for (const sx of [-1, 1]) addBox(g, [0.16, 2.3, 0.16], [sx * 0.95, 1.15, 0], beam);
  addBox(g, [2.1, 0.14, 0.14], [0, 1.95, 0], beam);

  const roof = new THREE.Mesh(
    boxProjectUVs(new THREE.ConeGeometry(1.6, 0.9, 4).rotateY(Math.PI / 4), 1.2),
    material('roof-tiles', () => pbrMaterial('roof_tiles', { side: THREE.DoubleSide })),
  );
  roof.position.y = 2.75;
  roof.castShadow = true;
  g.add(roof);
  return g;
}
