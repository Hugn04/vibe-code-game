import * as THREE from 'three';

/** Hướng mong muốn cho một khúc xương, trong không gian nhân vật (+Y lên, +Z phía trước, +X bên trái). */
type Dir = [number, number, number];
/**
 * Hướng cho tay/chân: một hướng chung (đối xứng 2 bên) hoặc riêng từng bên.
 * Tọa độ X luôn tính theo bên TRÁI (X dương = hướng ra ngoài); bên phải tự lật gương.
 */
type Limb = Dir | { L: Dir; R: Dir };

export interface PoseSpec {
  /** Độ cao hông so với mặt đất (m). */
  hipsHeight: number;
  /** Hướng hông → ngực (cả chuỗi xương sống, cổ, đầu đi theo). */
  spine: Dir;
  /** Hướng cổ → đỉnh đầu (mặc định theo spine). */
  head?: Dir;
  thigh: Limb;
  shin: Limb;
  foot?: Limb;
  upperArm: Limb;
  forearm: Limb;
  /** Tách tay/chân hai bên ra một chút theo trục X (m/1). */
  spread?: number;
}

type Side = 'L' | 'R';

interface Rig {
  hips: THREE.Bone;
  spine: THREE.Bone[];
  head: THREE.Bone[];
  thigh: Record<Side, THREE.Bone>;
  shin: Record<Side, THREE.Bone>;
  foot: Partial<Record<Side, THREE.Bone>>;
  upperArm: Record<Side, THREE.Bone>;
  forearm: Record<Side, THREE.Bone>;
}

const norm = (n: string) =>
  n
    .toLowerCase()
    .replace(/^mixamorig\d*[:_]?/, '')
    .replace(/[\s:_.-]/g, '');
const sideOf = (raw: string): Side | null => {
  const n = raw.toLowerCase();
  if (/left|(^|[_.\s-])l([_.\s-]|$)|\.l$|_l$/.test(n)) return 'L';
  if (/right|(^|[_.\s-])r([_.\s-]|$)|\.r$|_r$/.test(n)) return 'R';
  return null;
};

/** Nhận diện xương theo tên (hỗ trợ Mixamo, Blender Rigify/metarig, đa số rig người). */
function findRig(root: THREE.Object3D): Rig | null {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const find = (re: RegExp, side?: Side) =>
    bones.find((b) => re.test(norm(b.name)) && (side ? sideOf(b.name) === side : true));
  const hips = find(/^(hips?|pelvis|root?hips)$/) ?? find(/hips|pelvis/);
  if (!hips) return null;

  const limb = (re: RegExp, side: Side) => find(re, side);
  const rig: Partial<Rig> = { hips, foot: {} };
  const thighRe = /upleg|thigh|upperleg/;
  const shinRe =
    /^(left|right)?(leg|calf|shin|lowerleg|knee)(l|r)?$|calf|shin|lowerleg|(?<!up)leg(l|r)?$/;
  const upperArmRe = /upperarm|^(left|right)?arm(l|r)?$|(?<!fore|lower)arm(l|r)?$/;
  const forearmRe = /forearm|lowerarm/;
  rig.thigh = { L: limb(thighRe, 'L')!, R: limb(thighRe, 'R')! };
  rig.shin = {
    L: bones.find((b) => b.parent === rig.thigh!.L && shinRe.test(norm(b.name)))!,
    R: bones.find((b) => b.parent === rig.thigh!.R && shinRe.test(norm(b.name)))!,
  };
  rig.foot = {
    L: bones.find((b) => b.parent === rig.shin!.L && /foot|ankle/.test(norm(b.name))),
    R: bones.find((b) => b.parent === rig.shin!.R && /foot|ankle/.test(norm(b.name))),
  };
  rig.forearm = { L: limb(forearmRe, 'L')!, R: limb(forearmRe, 'R')! };
  rig.upperArm = {
    L: (rig.forearm.L?.parent as THREE.Bone) ?? limb(upperArmRe, 'L')!,
    R: (rig.forearm.R?.parent as THREE.Bone) ?? limb(upperArmRe, 'R')!,
  };
  // Xương sống: từ hông đi lên theo con không có trái/phải cho tới cổ/đầu.
  rig.spine = [];
  rig.head = [];
  let cur: THREE.Object3D = hips;
  for (;;) {
    const next: THREE.Bone | undefined = cur.children.find(
      (c) => (c as THREE.Bone).isBone && sideOf(c.name) === null && !/leg|thigh/.test(norm(c.name)),
    ) as THREE.Bone | undefined;
    if (!next) break;
    if (/neck|head/.test(norm(next.name))) rig.head.push(next);
    else rig.spine.push(next);
    cur = next;
  }
  const ok =
    rig.thigh.L &&
    rig.thigh.R &&
    rig.shin.L &&
    rig.shin.R &&
    rig.upperArm.L &&
    rig.upperArm.R &&
    rig.forearm.L &&
    rig.forearm.R &&
    rig.spine.length > 0;
  return ok ? (rig as Rig) : null;
}

/**
 * Dựng tư thế tĩnh (ngồi, nằm, đứng thở) cho nhân vật có khung xương bất kỳ:
 * mỗi khúc xương được xoay sao cho hướng "xương → xương con" trùng hướng mong muốn,
 * tính trong không gian thế giới nên không phụ thuộc trục cục bộ của từng rig.
 * Kết quả là AnimationClip, chuyển mượt (cross-fade) với các animation khác như thường.
 */
export class PoseBuilder {
  private readonly rig: Rig | null;
  private readonly bones: THREE.Bone[] = [];
  private readonly rest = new Map<THREE.Bone, { q: THREE.Quaternion; p: THREE.Vector3 }>();

  /**
   * @param root group bọc model, đã xoay sao cho nhân vật nhìn về +Z, chân ở y = 0.
   */
  constructor(private readonly root: THREE.Object3D) {
    this.rig = findRig(root);
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        const b = o as THREE.Bone;
        this.bones.push(b);
        this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
      }
    });
  }

  get supported(): boolean {
    return this.rig !== null;
  }

  /** Clip đứng yên có nhịp thở nhẹ giữa 2 tư thế. */
  clip(name: string, spec: PoseSpec, breathe: PoseSpec, period = 3.5): THREE.AnimationClip | null {
    return this.cycle(name, [spec, breathe], period);
  }

  /**
   * Clip lặp đi qua lần lượt các tư thế (chia đều trong `period` giây) rồi quay về tư thế đầu —
   * dùng cho chu kỳ bước đi khom, bò…
   */
  cycle(name: string, keys: readonly PoseSpec[], period: number): THREE.AnimationClip | null {
    if (!this.rig || keys.length === 0) return null;
    const solved = keys.map((k) => this.solve(k));
    this.restore();
    const times = [...keys.map((_, i) => (i * period) / keys.length), period];
    const loop = [...solved, solved[0]];

    const tracks: THREE.KeyframeTrack[] = [];
    for (const bone of this.bones) {
      const values = loop.flatMap((s) => s.q.get(bone)!.toArray());
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
    }
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${this.rig.hips.name}.position`,
        times,
        loop.flatMap((s) => s.hipsPos.toArray()),
      ),
    );
    return new THREE.AnimationClip(name, period, tracks);
  }

  private restore(): void {
    for (const [bone, r] of this.rest) {
      bone.quaternion.copy(r.q);
      bone.position.copy(r.p);
    }
    this.root.updateMatrixWorld(true);
  }

  private solve(spec: PoseSpec): { q: Map<THREE.Bone, THREE.Quaternion>; hipsPos: THREE.Vector3 } {
    const rig = this.rig!;
    this.restore();
    const spread = spec.spread ?? 0;
    const dir = (d: Dir, side?: Side) => {
      const x = side ? d[0] + (side === 'L' ? spread : -spread) : d[0];
      return new THREE.Vector3(x, d[1], d[2]).normalize();
    };
    /** Lấy hướng của 1 bên, lật gương nếu là bên phải. */
    const mirror = (l: Limb, side: Side): Dir => {
      const d = Array.isArray(l) ? l : l[side];
      return side === 'L' ? d : [-d[0], d[1], d[2]];
    };

    // Hông: xoay cả cơ thể để hông → ngực trùng hướng spine.
    this.aim(rig.hips, rig.spine[0], dir(spec.spine));
    for (let i = 0; i < rig.spine.length; i++) {
      const child = rig.spine[i + 1] ?? rig.head[0];
      if (child) this.aim(rig.spine[i], child, dir(spec.spine));
    }
    for (let i = 0; i < rig.head.length - 1; i++) {
      this.aim(rig.head[i], rig.head[i + 1], dir(spec.head ?? spec.spine));
    }
    for (const side of ['L', 'R'] as const) {
      this.aim(rig.thigh[side], rig.shin[side], dir(mirror(spec.thigh, side), side));
      const foot = rig.foot[side];
      if (foot) this.aim(rig.shin[side], foot, dir(mirror(spec.shin, side), side));
      const toe = foot?.children.find((c) => (c as THREE.Bone).isBone);
      if (foot && toe && spec.foot) this.aim(foot, toe, dir(mirror(spec.foot, side)));
      this.aim(rig.upperArm[side], rig.forearm[side], dir(mirror(spec.upperArm, side), side));
      const hand = rig.forearm[side].children.find((c) => (c as THREE.Bone).isBone);
      if (hand) this.aim(rig.forearm[side], hand, dir(mirror(spec.forearm, side)));
    }

    // Hạ/nâng hông cho đúng độ cao (giữ nguyên vị trí ngang).
    const hipsWorld = rig.hips.getWorldPosition(new THREE.Vector3());
    const rootPos = this.root.getWorldPosition(new THREE.Vector3());
    hipsWorld.y = rootPos.y + spec.hipsHeight;
    const parent = rig.hips.parent!;
    parent.updateMatrixWorld(true);
    const local = parent.worldToLocal(hipsWorld.clone());
    rig.hips.position.copy(local);
    this.root.updateMatrixWorld(true);

    const q = new Map<THREE.Bone, THREE.Quaternion>();
    for (const b of this.bones) q.set(b, b.quaternion.clone());
    return { q, hipsPos: rig.hips.position.clone() };
  }

  /** Xoay `bone` (trong không gian thế giới) để hướng bone → child trùng `target` (không gian nhân vật). */
  private aim(bone: THREE.Bone, child: THREE.Object3D, target: THREE.Vector3): void {
    this.root.updateMatrixWorld(true);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const want = target.clone().applyQuaternion(rootQ);
    const from = bone.getWorldPosition(new THREE.Vector3());
    const to = child.getWorldPosition(new THREE.Vector3());
    const cur = to.sub(from);
    if (cur.lengthSq() < 1e-10) return;
    cur.normalize();

    const delta = new THREE.Quaternion().setFromUnitVectors(cur, want);
    const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
    const newWorld = delta.multiply(worldQ);
    const parentQ = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(newWorld));
    bone.updateMatrixWorld(true);
  }
}

/** Đổi trái ↔ phải của một tư thế (để tạo nửa sau của chu kỳ bước). */
function swapSides(p: PoseSpec): PoseSpec {
  const sw = (l: Limb | undefined): Limb | undefined =>
    l && !Array.isArray(l) ? { L: l.R, R: l.L } : l;
  return {
    ...p,
    thigh: sw(p.thigh)!,
    shin: sw(p.shin)!,
    foot: sw(p.foot),
    upperArm: sw(p.upperArm)!,
    forearm: sw(p.forearm)!,
  };
}

/** Chu kỳ 4 nhịp: [chân trái trước, chuyển chân, chân phải trước, chuyển chân]. */
const gait = (contact: PoseSpec, passing: PoseSpec): PoseSpec[] => [
  contact,
  passing,
  swapSides(contact),
  swapSides(passing),
];

// ---- Đứng ----
const stand: PoseSpec = {
  hipsHeight: 0.98,
  spine: [0, 1, 0],
  thigh: [0.03, -1, 0],
  shin: [0.02, -1, 0],
  upperArm: [0.2, -1, 0],
  forearm: [0.1, -1, 0.15],
};

// ---- Ngồi xổm (khom người, gối gập) ----
const crouch: PoseSpec = {
  // Ngồi xổm hẳn: mông gần gót chân, đùi gần nằm ngang, hai gối hơi mở, tay đặt trên gối.
  hipsHeight: 0.42,
  spine: [0, 1, 0.5],
  head: [0, 1, 0.2],
  thigh: [0.28, 0.08, 1],
  shin: [0.1, -1, -0.38],
  foot: [0.05, -0.15, 1],
  upperArm: [0.25, -0.7, 0.55],
  forearm: [0.02, -0.4, 1],
};

// ---- Nằm sấp (chống khuỷu tay) ----
const prone: PoseSpec = {
  hipsHeight: 0.17,
  spine: [0, 0.03, 1],
  head: [0, 0.5, 1],
  thigh: [0.12, 0, -1],
  shin: [0.08, 0.05, -1],
  foot: [0, -1, -0.3],
  upperArm: [0.5, -0.4, 0.75],
  forearm: [-0.2, -0.05, 1],
};

/** Tư thế dựng sẵn — chỉnh số để đổi dáng. */
export const POSES = {
  stand: [stand, { ...stand, hipsHeight: 0.975, spine: [0, 1, 0.025], upperArm: [0.22, -1, 0.02] }],
  crouch: [crouch, { ...crouch, hipsHeight: 0.415, spine: [0, 1, 0.55] }],
  prone: [prone, { ...prone, hipsHeight: 0.175, head: [0, 0.55, 1] }],

  /** Đi khom: tay chân so le, hông nhấp nhô nhẹ. */
  crouchWalk: gait(
    {
      ...crouch,
      // Chân trái bước tới chạm đất, chân phải đạp sau (gối không chạm đất).
      hipsHeight: 0.63,
      spine: [0, 1, 0.38],
      thigh: { L: [0.12, -0.3, 1], R: [0.1, -1, 0.05] },
      shin: { L: [0.03, -1, 0.1], R: [0.03, -0.75, -0.7] },
      upperArm: { L: [0.2, -0.9, -0.3], R: [0.2, -0.55, 0.8] },
      forearm: { L: [0.05, -0.8, 0.5], R: [0, -0.3, 1] },
    },
    {
      // Chuyển chân: chân phải nhấc lên đưa ra trước, hông cao nhất.
      ...crouch,
      hipsHeight: 0.66,
      spine: [0, 1, 0.38],
      thigh: { L: [0.13, -0.65, 0.75], R: [0.12, -0.35, 1] },
      shin: { L: [0.04, -1, -0.1], R: [0.03, -0.8, -0.6] },
      upperArm: [0.2, -0.85, 0.25],
      forearm: [0, -0.5, 1],
    },
  ),

  /** Bò trườn: tay vươn lên trước, gối bên kia co lên. */
  crawl: gait(
    {
      ...prone,
      hipsHeight: 0.18,
      spine: [0.06, 0.03, 1],
      upperArm: { L: [0.3, -0.25, 1], R: [0.55, -0.45, 0.2] },
      forearm: { L: [0, -0.05, 1], R: [-0.25, -0.05, 1] },
      thigh: { L: [0.12, 0, -1], R: [0.8, 0, -0.1] },
      shin: { L: [0.08, 0.05, -1], R: [0.35, 0, -1] },
    },
    {
      ...prone,
      hipsHeight: 0.2,
      upperArm: [0.45, -0.35, 0.6],
      forearm: [-0.12, -0.05, 1],
      thigh: [0.4, 0, -0.9],
      shin: [0.18, 0.03, -1],
    },
  ),
} satisfies Record<string, PoseSpec[]>;
