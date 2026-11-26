import * as THREE from 'three';
import { box, M, sign } from './hospital';

/**
 * Đồ bệnh viện dựng bằng code (đợt 2). Gốc tọa độ ở chân vật, mặt trước nhìn về +Z
 * (trừ khi ghi khác). Vật liệu dùng chung qua `mat()` để gộp draw call.
 */

const cache = new Map<string, THREE.Material>();
const mat = (key: string, p: THREE.MeshStandardMaterialParameters) => {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = new THREE.MeshStandardMaterial(p)));
  return m;
};
const C = {
  red: () => mat('xRed', { color: 0xc62828, roughness: 0.4, metalness: 0.2 }),
  black: () => mat('xBlack', { color: 0x1c1c1e, roughness: 0.5 }),
  greyMetal: () => mat('xGreyMetal', { color: 0x8d969e, metalness: 0.6, roughness: 0.45 }),
  seat: () => mat('xSeat', { color: 0x24323d, roughness: 0.8 }),
  blueWater: () =>
    mat('xWater', { color: 0x6fb7e8, transparent: true, opacity: 0.55, roughness: 0.05 }),
  yellow: () => mat('xYellow', { color: 0xf2c230, roughness: 0.6 }),
  blue: () => mat('xBlue', { color: 0x2e6fb5, roughness: 0.6 }),
  vending: () => mat('xVending', { color: 0x8e1b1b, roughness: 0.45, metalness: 0.2 }),
  locker: () => mat('xLocker', { color: 0x7f9aa8, roughness: 0.5, metalness: 0.4 }),
  white: () => mat('xWhite', { color: 0xf5f6f5, roughness: 0.35 }),
  tire: () => mat('xTire', { color: 0x151515, roughness: 0.9 }),
  ambulance: () => mat('xAmb', { color: 0xf7f7f5, roughness: 0.3, metalness: 0.15 }),
  stripeRed: () => mat('xStripeR', { color: 0xd32f2f, roughness: 0.4 }),
  sirenRed: () => mat('xSirenR', { color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 2 }),
  sirenBlue: () => mat('xSirenB', { color: 0x3060ff, emissive: 0x2050ff, emissiveIntensity: 2 }),
  headlight: () => mat('xHead', { color: 0xffffff, emissive: 0xfff4d0, emissiveIntensity: 1.2 }),
  darkGlass: () => mat('xDarkGlass', { color: 0x1d2a33, roughness: 0.05, metalness: 0.5 }),
};

const cyl = (
  rTop: number,
  rBottom: number,
  h: number,
  pos: [number, number, number],
  m: THREE.Material,
  seg = 14,
) => {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, seg).translate(...pos),
    m,
  );
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};

const wheel = (r: number, tube: number, pos: [number, number, number], m: THREE.Material) => {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(r, tube, 8, 24).rotateY(Math.PI / 2).translate(...pos),
    m,
  );
  mesh.castShadow = true;
  return mesh;
};

/** Màn hình phát sáng có nội dung vẽ bằng canvas. */
function screen(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * h) / w);
  draw(canvas.getContext('2d')!, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** Xe lăn. */
export function wheelchair(): THREE.Group {
  const g = new THREE.Group();
  const metal = M.metal();
  g.add(box([0.46, 0.06, 0.44], [0, 0.5, 0], C.seat()));
  g.add(box([0.46, 0.45, 0.04], [0, 0.78, -0.22], C.seat()));
  for (const sx of [-1, 1]) {
    g.add(wheel(0.3, 0.02, [sx * 0.29, 0.31, -0.06], C.tire()));
    g.add(wheel(0.27, 0.008, [sx * 0.3, 0.31, -0.06], metal));
    g.add(box([0.02, 0.5, 0.02], [sx * 0.24, 0.75, -0.24], metal));
    g.add(box([0.02, 0.02, 0.12], [sx * 0.24, 1.0, -0.29], M.rubber()));
    g.add(box([0.02, 0.02, 0.5], [sx * 0.24, 0.66, 0], metal)); // tay vịn
    g.add(cyl(0.05, 0.05, 0.03, [sx * 0.2, 0.05, 0.25], C.tire(), 10));
    g.add(box([0.02, 0.45, 0.02], [sx * 0.2, 0.3, 0.22], metal));
    g.add(box([0.14, 0.015, 0.1], [sx * 0.12, 0.12, 0.33], metal)); // để chân
  }
  return g;
}

/** Cáng đẩy cấp cứu (dài theo trục Z). */
export function gurney(): THREE.Group {
  const g = new THREE.Group();
  const metal = M.metal();
  g.add(box([0.62, 0.05, 1.9], [0, 0.72, 0], metal));
  g.add(box([0.58, 0.1, 1.85], [0, 0.8, 0], M.mattress()));
  g.add(box([0.45, 0.08, 0.3], [0, 0.89, -0.7], M.pillow()));
  g.add(box([0.6, 0.04, 1.0], [0, 0.87, 0.35], M.blanket()));
  for (const sx of [-1, 1]) {
    g.add(box([0.03, 0.03, 1.4], [sx * 0.32, 0.95, 0], metal));
    for (const sz of [-1, 1]) {
      g.add(box([0.03, 0.62, 0.03], [sx * 0.26, 0.38, sz * 0.8], metal));
      g.add(cyl(0.05, 0.05, 0.03, [sx * 0.26, 0.05, sz * 0.8], C.tire(), 10));
    }
  }
  return g;
}

/** Bình chữa cháy treo tường (mặt tường ở -Z). */
export function fireExtinguisher(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.08, 0.5, [0, 0.25, 0.1], C.red()));
  g.add(cyl(0.05, 0.08, 0.06, [0, 0.53, 0.1], C.red()));
  g.add(box([0.12, 0.04, 0.03], [0.03, 0.58, 0.1], C.black()));
  g.add(box([0.02, 0.3, 0.02], [-0.09, 0.35, 0.13], C.black())); // vòi
  g.add(box([0.2, 0.05, 0.08], [0, 0.04, 0.05], C.greyMetal())); // giá đỡ
  const label = sign('PCCC', { width: 0.3, height: 0.12, bg: '#c62828' });
  label.position.set(0, 0.85, 0.03);
  g.add(label);
  return g;
}

/** Bình nước rửa tay khô treo tường (mặt tường ở -Z). */
export function sanitizer(): THREE.Group {
  const g = new THREE.Group();
  g.add(box([0.12, 0.24, 0.1], [0, 0, 0.05], C.white()));
  g.add(box([0.1, 0.08, 0.02], [0, 0.04, 0.105], C.blue()));
  g.add(box([0.03, 0.03, 0.04], [0, -0.13, 0.08], M.metal()));
  return g;
}

/** Cây nước uống có bình xanh. */
export function waterDispenser(): THREE.Group {
  const g = new THREE.Group();
  g.add(box([0.34, 1.0, 0.34], [0, 0.5, 0], C.white()));
  g.add(box([0.22, 0.12, 0.02], [0, 0.75, 0.17], C.black()));
  g.add(box([0.03, 0.04, 0.03], [-0.05, 0.78, 0.19], C.stripeRed()));
  g.add(box([0.03, 0.04, 0.03], [0.05, 0.78, 0.19], C.blue()));
  g.add(cyl(0.14, 0.14, 0.42, [0, 1.22, 0], C.blueWater(), 18));
  g.add(cyl(0.05, 0.14, 0.08, [0, 1.47, 0], C.blueWater(), 18));
  return g;
}

/** Máy bán nước tự động. */
export function vendingMachine(): THREE.Group {
  const g = new THREE.Group();
  g.add(box([0.95, 1.9, 0.8], [0, 0.95, 0], C.vending()));
  const front = screen(0.62, 1.3, (ctx, W, H) => {
    ctx.fillStyle = '#e9f3f7';
    ctx.fillRect(0, 0, W, H);
    const colors = ['#d32f2f', '#1976d2', '#388e3c', '#f9a825', '#7b1fa2', '#00838f'];
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.15) * (H / rows);
      ctx.fillStyle = '#b0bec5';
      ctx.fillRect(0, y + H / rows - 10, W, 6);
      for (let c = 0; c < 6; c++) {
        ctx.fillStyle = colors[(r + c) % colors.length];
        const x = 14 + (c * (W - 28)) / 6;
        ctx.fillRect(x, y + 10, (W - 28) / 6 - 14, H / rows - 26);
      }
    }
  });
  front.position.set(-0.1, 1.15, 0.405);
  g.add(front);
  g.add(box([0.18, 0.5, 0.02], [0.33, 1.25, 0.405], C.black()));
  g.add(box([0.6, 0.18, 0.04], [-0.1, 0.25, 0.41], C.black()));
  const label = sign('NƯỚC UỐNG', { width: 0.8, height: 0.16, bg: '#8e1b1b' });
  label.position.set(0, 1.78, 0.41);
  label.scale.z = 0.3;
  g.add(label);
  return g;
}

/** Dãy tủ đồ nhân viên (n ngăn). */
export function lockers(n: number): THREE.Group {
  const g = new THREE.Group();
  const w = 0.42;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * w;
    g.add(box([w - 0.02, 1.85, 0.5], [x, 0.925, 0], C.locker()));
    for (let v = 0; v < 4; v++)
      g.add(box([0.22, 0.015, 0.01], [x, 1.6 - v * 0.04, 0.255], C.black()));
    g.add(box([0.03, 0.12, 0.03], [x + 0.13, 1.0, 0.27], M.metal()));
  }
  return g;
}

/** Bồn rửa tay trên tủ (mặt tường ở -Z). */
export function sinkUnit(): THREE.Group {
  const g = new THREE.Group();
  g.add(box([0.7, 0.8, 0.5], [0, 0.4, 0.25], C.white()));
  g.add(box([0.72, 0.06, 0.52], [0, 0.83, 0.25], M.counter()));
  g.add(box([0.44, 0.02, 0.3], [0, 0.861, 0.28], M.metal()));
  g.add(cyl(0.015, 0.015, 0.25, [0, 0.98, 0.07], M.metal(), 8));
  g.add(box([0.03, 0.03, 0.14], [0, 1.1, 0.13], M.metal()));
  g.add(box([0.005, 0.7, 0.3], [-0.12, 0.42, 0.5], M.metal())); // khe cửa tủ
  return g;
}

/** TV màn phẳng treo tường (mặt tường ở -Z), màn hình có nội dung. */
export function flatTV(title: string, line: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box([1.3, 0.76, 0.06], [0, 0, 0.05], C.black()));
  const scr = screen(1.22, 0.68, (ctx, W, H) => {
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#0f5f78');
    grd.addColorStop(1, '#0a2f3d');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `700 ${H * 0.14}px system-ui, Arial`;
    ctx.fillText(title, W / 2, H * 0.4);
    ctx.font = `500 ${H * 0.09}px system-ui, Arial`;
    ctx.fillStyle = '#bfe7f3';
    ctx.fillText(line, W / 2, H * 0.62);
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(W * 0.08, H * 0.12, H * 0.14, H * 0.04);
    ctx.fillRect(W * 0.08 + H * 0.05, H * 0.07, H * 0.04, H * 0.14);
  });
  scr.position.z = 0.081;
  g.add(scr);
  return g;
}

/** Hộp đèn đọc phim X-quang treo tường (mặt tường ở -Z). */
export function xrayViewer(): THREE.Group {
  const g = new THREE.Group();
  g.add(box([0.9, 0.55, 0.06], [0, 0, 0.03], C.white()));
  const film = screen(0.8, 0.46, (ctx, W, H) => {
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(220,235,255,0.85)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 7; i++) {
      const y = H * 0.18 + i * H * 0.1;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(
          W / 2 + s * W * 0.12,
          y,
          W * 0.14,
          H * 0.05,
          0,
          s > 0 ? Math.PI : 0,
          s > 0 ? Math.PI * 1.9 : Math.PI * 0.9,
          s > 0,
        );
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(220,235,255,0.7)';
    ctx.fillRect(W / 2 - 8, H * 0.08, 16, H * 0.84);
  });
  film.position.z = 0.062;
  g.add(film);
  return g;
}

/** Bình phong 3 tấm (dài theo trục X). */
export function privacyScreen(): THREE.Group {
  const g = new THREE.Group();
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Group();
    p.add(box([0.03, 1.7, 0.03], [-0.3, 0.85, 0], M.metal()));
    p.add(box([0.03, 1.7, 0.03], [0.3, 0.85, 0], M.metal()));
    p.add(box([0.6, 0.03, 0.03], [0, 1.68, 0], M.metal()));
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 1.4).translate(0, 0.95, 0),
      M.curtain(),
    );
    cloth.castShadow = true;
    p.add(cloth);
    p.position.x = i * 0.6;
    p.rotation.y = i * 0.35;
    g.add(p);
  }
  return g;
}

/** Thùng rác có nắp: vàng = rác y tế, xanh = rác thường. */
export function bin(kind: 'medical' | 'general'): THREE.Group {
  const g = new THREE.Group();
  const m = kind === 'medical' ? C.yellow() : C.blue();
  g.add(cyl(0.17, 0.15, 0.55, [0, 0.275, 0], m, 16));
  g.add(cyl(0.18, 0.18, 0.04, [0, 0.57, 0], m, 16));
  return g;
}

/** Tủ lạnh trữ mẫu xét nghiệm. */
export function fridge(): THREE.Group {
  const g = new THREE.Group();
  g.add(box([0.7, 1.75, 0.65], [0, 0.875, 0], C.white()));
  g.add(box([0.68, 0.01, 0.01], [0, 1.15, 0.33], M.metal()));
  g.add(box([0.03, 0.4, 0.04], [0.28, 1.4, 0.34], M.metal()));
  g.add(box([0.03, 0.3, 0.04], [0.28, 0.8, 0.34], M.metal()));
  const label = sign('MẪU XN', { width: 0.36, height: 0.12, bg: '#6a4c93' });
  label.position.set(-0.1, 1.55, 0.33);
  g.add(label);
  return g;
}

/** Ghế băng chờ ngoài trời (dài theo trục X). */
export function bench(): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-0.7, 0.7]) {
    g.add(box([0.06, 0.45, 0.45], [sx, 0.225, 0], C.greyMetal()));
    g.add(box([0.06, 0.5, 0.06], [sx, 0.7, -0.2], C.greyMetal()));
  }
  for (let i = 0; i < 3; i++) g.add(box([1.6, 0.04, 0.12], [0, 0.46, -0.15 + i * 0.14], M.wood()));
  for (let i = 0; i < 2; i++) g.add(box([1.6, 0.1, 0.03], [0, 0.72 + i * 0.16, -0.21], M.wood()));
  return g;
}

/** Xe cấp cứu (đầu xe nhìn về +X). Kích thước ~5.6 × 2.1 × 2.6 m. */
export function ambulance(): THREE.Group {
  const g = new THREE.Group();
  const body = C.ambulance();
  g.add(box([3.6, 2.1, 2.05], [-0.9, 1.45, 0], body)); // thùng xe
  g.add(box([1.8, 1.3, 2.0], [1.75, 1.05, 0], body)); // cabin
  g.add(box([0.9, 0.6, 1.95], [1.55, 1.95, 0], body));
  // Kính chắn gió + kính bên
  const ws = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.62)
      .rotateY(Math.PI / 2)
      .rotateZ(-0.35)
      .translate(2.12, 1.92, 0),
    C.darkGlass(),
  );
  g.add(ws);
  for (const sz of [-1, 1]) g.add(box([0.85, 0.5, 0.02], [1.55, 1.95, sz * 1.0], C.darkGlass()));
  // Sọc đỏ + chữ thập
  for (const sz of [-1, 1]) {
    g.add(box([5.4, 0.18, 0.02], [0.0, 1.15, sz * 1.04], C.stripeRed()));
    const cross = sign('CẤP CỨU 115', {
      width: 1.9,
      height: 0.42,
      bg: '#ffffff',
      fg: '#d32f2f',
      icon: 'cross',
    });
    cross.position.set(-0.9, 1.9, sz * 1.035);
    cross.rotation.y = sz > 0 ? 0 : Math.PI;
    cross.scale.z = 0.2;
    g.add(cross);
  }
  // Đèn ưu tiên trên nóc + đèn pha
  g.add(box([0.25, 0.12, 0.7], [0.9, 2.33, -0.4], C.sirenRed()));
  g.add(box([0.25, 0.12, 0.7], [0.9, 2.33, 0.4], C.sirenBlue()));
  for (const sz of [-0.7, 0.7]) g.add(box([0.05, 0.16, 0.3], [2.66, 0.85, sz], C.headlight()));
  g.add(box([0.1, 0.3, 2.0], [2.66, 0.55, 0], C.black())); // cản trước
  // Bánh xe
  for (const x of [-1.9, 1.7]) {
    for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.28, 20)
          .rotateX(Math.PI / 2)
          .translate(x, 0.42, sz * 0.92),
        C.tire(),
      );
      t.castShadow = true;
      g.add(t);
      g.add(
        cyl(0.22, 0.22, 0.02, [0, 0, 0], M.metal(), 16)
          .translateX(x)
          .translateY(0.42)
          .translateZ(sz * 1.07)
          .rotateX(Math.PI / 2),
      );
    }
  }
  return g;
}
