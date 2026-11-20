/**
 * Tất cả thông số tinh chỉnh gameplay nằm ở đây.
 * Sửa giá trị trong file này thay vì rải "magic number" trong code.
 */
export const CONFIG = {
  world: {
    /** Nửa kích thước bản đồ: người chơi bị giới hạn trong [-size, size]. */
    size: 95,
    /** Seed cố định để bản đồ giống nhau mỗi lần chơi. */
    seed: 1337,
    /** Điểm xuất phát của người chơi. */
    spawn: { x: 0, z: 7 },
  },
  forest: {
    /** Bán kính bãi đất trống giữa làng. */
    plazaRadius: 11,
    houseCount: 7,
    /** Khoảng cách từ tâm làng tới các nhà. */
    houseRing: 21,
    /** Số cây thật (ez-tree) — điện thoại dùng ít hơn. */
    treeCount: 340,
    mobileTreeCount: 110,
    rockCount: 70,
    /** Gốc cây + thân cây đổ. */
    logCount: 30,
    /** Bụi + dương xỉ (điện thoại dùng một nửa). */
    bushCount: 180,
    /** Khoảng cách tối thiểu giữa 2 cây. */
    treeSpacing: 4.5,
    /** Cạnh ô lưới (m) khi gom cây/đá thành nhóm để bỏ qua nhóm ngoài khung nhìn. */
    chunkSize: 30,
    pathWidth: 1.8,
  },
  player: {
    radius: 0.5,
    /** Tốc độ gần với người thật (m/s), hơi nhanh hơn cho dễ chơi. */
    walkSpeed: 3.2,
    runSpeed: 7,
    /** Nhảy cao ~1.3 m — vẫn lên được thùng gỗ. */
    jumpVelocity: 8,
    gravity: 25,
    groundAccel: 12,
    airAccel: 4,
    turnSharpness: 12,
    /** Độ cao điểm camera nhìn vào theo tư thế (m). */
    eyeHeight: { stand: 1.6, crouch: 0.95, prone: 0.55 },
    /** Bấm nhảy khi đang ngồi/nằm: chờ đứng dậy xong (giây) rồi mới bật nhảy. */
    standUpTime: { stand: 0, crouch: 0.35, prone: 0.6 },
    /** Tốc độ đi khom và bò (m/s). */
    crouchSpeed: 1.7,
    proneSpeed: 0.8,
    /**
     * false: nhân vật quay mặt theo hướng di chuyển (kiểu phiêu lưu).
     * true: luôn quay theo hướng ngắm của camera, đi ngang/lùi được (kiểu bắn súng).
     */
    faceAimDirection: false,
  },
  camera: {
    fov: 60,
    portraitFov: 78,
    distance: 7,
    minDistance: 3,
    maxDistance: 20,
    pitch: 0.3,
    /** Âm = camera thấp hơn đầu nhân vật, ngắm lên trên được. */
    minPitch: -0.35,
    maxPitch: 1.3,
    /** Độ nhạy chuột (radian / pixel). */
    yawSpeed: 0.0025,
    pitchSpeed: 0.0025,
    zoomSpeed: 0.01,
    followSharpness: 14,
    focusHeight: 1.6,
    /** Lệch camera sang phải (góc nhìn qua vai) để tâm ngắm không bị nhân vật che. */
    shoulderOffset: 0.8,
    /** Camera không được xuống thấp hơn độ cao này (tránh chui xuống đất). */
    minHeight: 0.3,
    /** Khoảng cách giữ lại trước vật cản khi camera bị che. */
    collisionPadding: 0.3,
  },
  character: {
    /** File nằm trong public/ — đổi model chỉ cần đổi url + tên clip bên dưới. */
    /** Người thật CC0 (grab3d.com "Man Base Mesh", đã tối ưu bằng gltf-transform). */
    url: 'models/man.glb',
    /** Chiều cao hiển thị (m); model được tự co giãn cho khớp. */
    height: 1.8,
    /** Tên animation trong file glb ứng với từng trạng thái. */
    /**
     * Clip có sẵn trong file. Trạng thái nào thiếu (idle, sit, lie) được dựng tự động
     * bằng PoseBuilder; thiếu jump thì giữ bước chân, phát chậm khi ở trên không.
     */
    clips: { walk: 'walk', run: 'run' } as Partial<
      Record<'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'crouchWalk' | 'prone' | 'crawl', string>
    >,
    /** Xoay model cho mặt nhìn về +Z. */
    rotationY: 0,
    /** Thời gian chuyển mượt giữa 2 animation (giây). */
    fade: 0.2,
    /** Thời gian chuyển khi ngồi xuống/nằm xuống/đứng dậy (giây). */
    postureFade: 0.6,
    /** Tốc độ khớp bước của chu kỳ đi khom / bò tự dựng (m/s). */
    crouchClipSpeed: 1.5,
    crawlClipSpeed: 0.75,
    /** Trên tốc độ này dùng animation chạy thay vì đi. */
    runThreshold: 5,
    /** Tốc độ di chuyển khớp với tốc độ gốc của clip đi/chạy (để chân không bị trượt). */
    walkClipSpeed: 2.6,
    runClipSpeed: 6,
  },
  touch: {
    /** Bán kính joystick ảo (px). */
    joystickRadius: 56,
    /** Đẩy joystick quá tỉ lệ này (0..1) thì tự chạy nhanh. */
    runThreshold: 0.9,
    /** Hệ số vuốt màn hình → xoay camera (so với 1 pixel chuột). */
    lookSensitivity: 1.8,
  },
  aim: {
    maxDistance: 120,
    color: 0xff3d3d,
  },
  physics: {
    /** Bước mô phỏng cố định (giây) — vật lý chạy giống nhau ở mọi FPS. */
    fixedStep: 1 / 60,
    /** Giới hạn thời gian 1 frame để tránh "spiral of death" khi tab bị lag. */
    maxFrameTime: 0.25,
  },
  render: {
    maxPixelRatio: 2,
    shadowMapSize: 4096,
    /** Giảm tải cho điện thoại: độ phân giải và bóng đổ thấp hơn. */
    mobileMaxPixelRatio: 1.5,
    mobileShadowMapSize: 1024,
    shadowArea: 30,
    /** Màu nền trước khi bầu trời HDRI tải xong; cũng là màu sương xa. */
    background: 0xbfd0dc,
    fogNear: 30,
    fogFar: 150,
    /** Bầu trời ảnh thật (Poly Haven, CC0): làm nền + ánh sáng môi trường. */
    skyUrl: 'hdri/sky_1k.hdr',
    environmentIntensity: 0.55,
    /** Độ phơi sáng sau khi tone mapping ACES. */
    exposure: 0.82,
    /** Hậu kỳ (AO, bloom, khử răng cưa) — chỉ bật trên máy tính. */
    postprocessing: true,
    bloomStrength: 0.25,
  },
} as const;
