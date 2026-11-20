import * as THREE from 'three';

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export interface HouseOptions {
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  wallColor: number;
  roofColor: number;
}

const FOUNDATION = 0.3;

/** Tổng chiều cao nhà (tới nóc mái). */
export const houseHeight = (o: HouseOptions): number => FOUNDATION + o.wallHeight + o.roofHeight;

/**
 * Nhà gỗ low-poly. Gốc tọa độ ở tâm sàn, cửa chính nhìn về +Z.
 */
export function createHouse(o: HouseOptions): THREE.Group {
  const g = new THREE.Group();
  const { width: w, depth: d, wallHeight: wh, roofHeight: rh } = o;
  const stone = mat(0x8a877e);
  const beam = mat(0x5a3d26);
  const glass = mat(0xffd27a, { emissive: 0xffb347, emissiveIntensity: 0.45 });
  const wallTop = FOUNDATION + wh;

  // Móng + tường
  box(g, [w + 0.4, FOUNDATION, d + 0.4], [0, FOUNDATION / 2, 0], stone);
  box(g, [w, wh, d], [0, FOUNDATION + wh / 2, 0], mat(o.wallColor));

  // Cột gỗ ở 4 góc
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(g, [0.28, wh, 0.28], [sx * (w / 2), FOUNDATION + wh / 2, sz * (d / 2)], beam);
    }
  }
  // Xà ngang dưới mái
  box(g, [w + 0.3, 0.22, 0.3], [0, wallTop - 0.11, d / 2], beam);
  box(g, [w + 0.3, 0.22, 0.3], [0, wallTop - 0.11, -d / 2], beam);

  // Mái hai dốc: hình tam giác đùn dọc trục Z
  const overhang = 0.45;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0);
  shape.lineTo(w / 2 + overhang, 0);
  shape.lineTo(0, rh);
  shape.closePath();
  const roofDepth = d + overhang * 2;
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: roofDepth, bevelEnabled: false });
  roofGeo.translate(0, wallTop, -roofDepth / 2);
  const roof = new THREE.Mesh(roofGeo, mat(o.roofColor));
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);

  // Ống khói
  box(g, [0.6, rh + 0.7, 0.6], [w / 4, wallTop + (rh + 0.7) / 2, -d / 4], stone);

  // Cửa + bậc thềm
  box(g, [1.1, 2.0, 0.12], [0, FOUNDATION + 1.0, d / 2 + 0.06], beam);
  box(g, [1.6, 0.18, 0.7], [0, 0.09, d / 2 + 0.55], stone);

  // Cửa sổ phát sáng ấm
  const winY = FOUNDATION + 1.6;
  if (w >= 5) {
    for (const sx of [-1, 1]) box(g, [0.9, 0.8, 0.08], [sx * (w / 2 - 1.1), winY, d / 2 + 0.04], glass);
  }
  for (const sx of [-1, 1]) box(g, [0.08, 0.8, 0.9], [sx * (w / 2 + 0.04), winY, 0], glass);
  box(g, [0.9, 0.8, 0.08], [0, winY, -d / 2 - 0.04], glass);

  return g;
}

/** Giếng đá có mái nhỏ. Gốc ở tâm đáy. */
export const WELL_RADIUS = 1.1;
export function createWell(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0x8f8b82);
  const wood = mat(0x6b4a2f);

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(WELL_RADIUS, 1.2, 0.9, 12), stone);
  ring.position.y = 0.45;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 12).rotateX(-Math.PI / 2),
    mat(0x2b5f7a, { roughness: 0.2 }),
  );
  water.position.y = 0.86;
  ring.castShadow = ring.receiveShadow = true;
  g.add(ring, water);

  for (const sx of [-1, 1]) box(g, [0.16, 2.3, 0.16], [sx * 0.95, 1.15, 0], wood);
  box(g, [2.1, 0.12, 0.12], [0, 1.95, 0], wood);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 4).rotateY(Math.PI / 4), mat(0x8e3b2f));
  roof.position.y = 2.75;
  roof.castShadow = true;
  g.add(roof);
  return g;
}

/** Thùng gỗ cạnh `size`. Gốc ở tâm đáy. */
export function createCrate(size: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size).translate(0, size / 2, 0),
    mat(0xa0763f),
  );
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
