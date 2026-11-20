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
    treeCount: 650,
    /** Tỉ lệ cây thông (còn lại là cây tán tròn). */
    pineRatio: 0.6,
    rockCount: 90,
    bushCount: 220,
    /** Khoảng cách tối thiểu giữa 2 cây. */
    treeSpacing: 2.6,
    pathWidth: 1.8,
  },
  player: {
    radius: 0.5,
    walkSpeed: 5,
    runSpeed: 10,
    jumpVelocity: 9,
    gravity: 25,
    groundAccel: 12,
    airAccel: 4,
    turnSharpness: 14,
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
    url: 'models/RobotExpressive.glb',
    /** Chiều cao hiển thị (m); model được tự co giãn cho khớp. */
    height: 1.8,
    /** Tên animation trong file glb ứng với từng trạng thái. */
    clips: { idle: 'Idle', walk: 'Walking', run: 'Running', jump: 'Jump' },
    /** Thời gian chuyển mượt giữa 2 animation (giây). */
    fade: 0.2,
    /** Trên tốc độ này dùng animation chạy thay vì đi. */
    runThreshold: 7,
    /** Tốc độ di chuyển khớp với tốc độ gốc của clip đi/chạy (để chân không bị trượt). */
    walkClipSpeed: 4,
    runClipSpeed: 9,
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
    shadowMapSize: 2048,
    /** Giảm tải cho điện thoại: độ phân giải và bóng đổ thấp hơn. */
    mobileMaxPixelRatio: 1.5,
    mobileShadowMapSize: 1024,
    shadowArea: 30,
    background: 0xa9c9bd,
    fogNear: 22,
    fogFar: 95,
  },
} as const;
