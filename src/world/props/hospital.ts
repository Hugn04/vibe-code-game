import * as THREE from 'three';
import { pbrMaterial } from '../textures';
import { boxProjectUVs } from './buildings';

/** Vật liệu dùng chung cho đồ bệnh viện (tạo 1 lần). */
const cache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
}
const std = (key: string, p: THREE.MeshStandardMaterialParameters) =>
  mat(key, () => new THREE.MeshStandardMaterial(p));

export const M = {
  metal: () => std('metal', { color: 0xd8dde2, metalness: 0.85, roughness: 0.3 }),
  darkMetal: () => std('darkMetal', { color: 0x3a3f45, metalness: 0.7, roughness: 0.45 }),
  mattress: () => std('mattress', { color: 0xeef2f5, roughness: 0.9 }),
  blanket: () => std('blanket', { color: 0x7fb2d6, roughness: 0.95 }),
  pillow: () => std('pillow', { color: 0xffffff, roughness: 0.95 }),
  curtain: () => std('curtain', { color: 0x9cc9c4, roughness: 0.95, side: THREE.DoubleSide }),
  white: () => std('whitePaint', { color: 0xf3f4f2, roughness: 0.6 }),
  counter: () => std('counter', { color: 0xe9ecef, roughness: 0.35 }),
  wood: () => mat('woodTop', () => pbrMaterial('beam', { color: 0xc9a27a })),
  stripe: () => std('stripe', { color: 0x4aa3a0, roughness: 0.6 }),
  rubber: () => std('rubber', { color: 0x222222, roughness: 0.8 }),
  orTable: () => std('orTable', { color: 0x2f6f6a, roughness: 0.5 }),
  glass: () =>
    std('glass', {
      color: 0xbcd7e6,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  lightPanel: () =>
    std('lightPanel', { color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2 }),
  lampGlow: () => std('lampGlow', { color: 0xffffff, emissive: 0xfffbea, emissiveIntensity: 3 }),
};

/** Hộp có UV chiếu theo mét (texture không bị kéo giãn). */
export function box(
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  tile = 1.5,
): THREE.Mesh {
  const geo = boxProjectUVs(new THREE.BoxGeometry(...size).translate(...pos), tile);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function cylinder(
  r: number,
  h: number,
  pos: [number, number, number],
  material: THREE.Material,
  seg = 12,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg).translate(...pos), material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Giường bệnh: khung kim loại, đệm, gối, chăn, thành giường, bánh xe. Đầu giường ở -Z. */
export const BED_SIZE = { w: 1.0, l: 2.1, top: 0.62 };
export function hospitalBed(): THREE.Group {
  const g = new THREE.Group();
  const { w, l } = BED_SIZE;
  const metal = M.metal();
  g.add(box([w, 0.08, l], [0, 0.42, 0], metal));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cylinder(0.025, 0.36, [sx * (w / 2 - 0.06), 0.22, sz * (l / 2 - 0.06)], metal, 8));
      g.add(
        cylinder(0.045, 0.04, [sx * (w / 2 - 0.06), 0.045, sz * (l / 2 - 0.06)], M.rubber(), 10),
      );
    }
  }
  g.add(box([w - 0.06, 0.16, l - 0.08], [0, 0.54, 0], M.mattress()));
  g.add(box([w - 0.04, 0.06, l * 0.62], [0, 0.63, l * 0.16], M.blanket()));
  g.add(box([0.6, 0.1, 0.35], [0, 0.66, -l / 2 + 0.3], M.pillow()));
  // Đầu + chân giường
  g.add(box([w, 0.65, 0.05], [0, 0.75, -l / 2], M.white()));
  g.add(box([w, 0.4, 0.05], [0, 0.62, l / 2], M.white()));
  // Thành giường hai bên
  for (const sx of [-1, 1]) {
    g.add(box([0.03, 0.03, l * 0.45], [sx * (w / 2 + 0.01), 0.82, -l * 0.15], metal));
    for (const z of [-0.6, -0.05])
      g.add(cylinder(0.012, 0.2, [sx * (w / 2 + 0.01), 0.72, z], metal, 6));
  }
  return g;
}

/** Cột truyền dịch có túi dịch. */
export function ivStand(): THREE.Group {
  const g = new THREE.Group();
  const metal = M.metal();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box([0.32, 0.03, 0.03], [Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16], metal);
    leg.rotation.y = -a;
    g.add(leg);
  }
  g.add(cylinder(0.012, 1.9, [0, 1.03, 0], metal, 8));
  g.add(box([0.32, 0.015, 0.015], [0, 1.95, 0], metal));
  const bag = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.06, 0.14, 4, 8).translate(0.12, 1.78, 0),
    std('ivBag', { color: 0xe8f4ff, transparent: true, opacity: 0.7, roughness: 0.2 }),
  );
  g.add(bag);
  return g;
}

/** Rèm ngăn giường (tấm vải gợn sóng trên thanh treo). Dài theo trục X. */
export function curtain(length: number, height = 1.9): THREE.Group {
  const g = new THREE.Group();
  const seg = Math.max(8, Math.round(length * 8));
  const geo = new THREE.PlaneGeometry(length, height, seg, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++)
    pos.setZ(i, Math.sin((pos.getX(i) / length) * Math.PI * seg * 0.5) * 0.05);
  geo.computeVertexNormals();
  geo.translate(0, 0.35 + height / 2, 0);
  const cloth = new THREE.Mesh(geo, M.curtain());
  cloth.castShadow = cloth.receiveShadow = true;
  g.add(cloth);
  g.add(box([length, 0.025, 0.025], [0, 0.35 + height + 0.05, 0], M.metal()));
  return g;
}

/** Quầy lễ tân hình chữ L, mặt gỗ. Mặt trước nhìn về +Z. */
export function receptionDesk(width = 4): THREE.Group {
  const g = new THREE.Group();
  g.add(box([width, 1.05, 0.7], [0, 0.525, 0], M.counter()));
  g.add(box([width + 0.1, 0.05, 0.45], [0, 1.12, 0.2], M.wood()));
  g.add(box([0.7, 0.75, 1.6], [width / 2 - 0.35, 0.375, -1.0], M.counter()));
  g.add(box([0.8, 0.04, 1.7], [width / 2 - 0.35, 0.77, -1.0], M.wood()));
  g.add(box([width - 0.2, 0.12, 0.02], [0, 0.85, 0.36], M.stripe()));
  return g;
}

/** Bàn mổ + đèn mổ treo trần (đèn tròn phát sáng). */
export function operatingTable(ceiling: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box([0.5, 0.08, 0.5], [0, 0.04, 0], M.darkMetal()));
  g.add(cylinder(0.12, 0.75, [0, 0.45, 0], M.metal()));
  g.add(box([0.6, 0.1, 2.0], [0, 0.88, 0], M.orTable()));
  g.add(box([0.62, 0.04, 2.02], [0, 0.82, 0], M.metal()));
  // Cần đèn + chao đèn
  g.add(cylinder(0.03, ceiling - 2.25, [0, (ceiling + 2.25) / 2, 0], M.metal(), 8));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.55, 0.14, 24).translate(0, 2.2, 0),
    M.metal(),
  );
  shade.castShadow = true;
  g.add(shade);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.46, 24).rotateX(Math.PI / 2).translate(0, 2.125, 0),
    M.lampGlow(),
  );
  g.add(glow);
  return g;
}

/** Tấm đèn trần (phát sáng, bloom bắt sáng). */
export function ceilingPanel(y: number, w = 1.2, d = 0.6): THREE.Group {
  const g = new THREE.Group();
  g.add(box([w + 0.06, 0.04, d + 0.06], [0, y - 0.02, 0], M.white()));
  const light = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2).translate(0, y - 0.045, 0),
    M.lightPanel(),
  );
  g.add(light);
  return g;
}

/**
 * Biển chữ (vẽ bằng canvas). Mặt chữ nhìn về +Z.
 * @param glow biển phát sáng (vd. lối thoát hiểm).
 */
export function sign(
  text: string,
  opts: {
    width?: number;
    height?: number;
    bg?: string;
    fg?: string;
    glow?: boolean;
    icon?: 'cross';
  } = {},
): THREE.Group {
  const { width = 1.6, height = 0.35, bg = '#1f6f8b', fg = '#ffffff', glow = false, icon } = opts;
  const canvas = document.createElement('canvas');
  const px = 128;
  canvas.width = Math.round((width / height) * px);
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let x = canvas.width / 2;
  if (icon === 'cross') {
    const s = px * 0.62;
    const cx = px * 0.55;
    const cy = px / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(cx - s * 0.12, cy - s * 0.38, s * 0.24, s * 0.76);
    ctx.fillRect(cx - s * 0.38, cy - s * 0.12, s * 0.76, s * 0.24);
    x = (canvas.width + px) / 2;
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = px * 0.5;
  ctx.font = `700 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
  const maxW = (icon ? canvas.width - px : canvas.width) * 0.9;
  while (ctx.measureText(text).width > maxW && size > 12) {
    size -= 2;
    ctx.font = `700 ${size}px system-ui, "Segoe UI", Arial, sans-serif`;
  }
  ctx.fillText(text, x, px / 2 + size * 0.04);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.5,
    emissive: glow ? 0xffffff : 0x000000,
    emissiveMap: glow ? tex : null,
    emissiveIntensity: glow ? 1.4 : 0,
  });
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height).translate(0, 0, 0.026),
    material,
  );
  g.add(face);
  g.add(box([width + 0.04, height + 0.04, 0.05], [0, 0, 0], M.white()));
  return g;
}
