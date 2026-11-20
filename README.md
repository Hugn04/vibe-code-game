# Movement Demo (three.js)

Demo điều khiển nhân vật góc nhìn thứ 3 viết bằng **three.js + TypeScript + Vite**.

## Chạy

```bash
npm install
npm run dev        # mở http://localhost:5173
```

| Lệnh                | Tác dụng                                  |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Dev server có hot reload                  |
| `npm run build`     | Kiểm tra kiểu + build ra `dist/`          |
| `npm run preview`   | Chạy thử bản build                        |
| `npm run typecheck` | Chỉ kiểm tra TypeScript                   |
| `npm test`          | Chạy unit test (Vitest)                   |
| `npm run format`    | Format code bằng Prettier                 |

## Điều khiển

| Phím              | Hành động       |
| ----------------- | --------------- |
| WASD / mũi tên    | Di chuyển       |
| Shift             | Chạy nhanh      |
| Space             | Nhảy            |
| Kéo chuột         | Xoay camera     |
| Lăn chuột         | Zoom            |
| Esc / P           | Tạm dừng        |

## Cấu trúc

```
src/
├── main.ts                    Điểm khởi động, hot reload
├── config.ts                  Toàn bộ thông số tinh chỉnh gameplay
├── core/
│   ├── Game.ts                Vòng lặp: input → vật lý bước cố định → render
│   └── Input.ts               Bàn phím/chuột + bảng phím (BINDINGS)
├── entities/Player.ts         Nhân vật: vật lý + hoạt ảnh
├── camera/ThirdPersonCamera.ts Camera quay quanh nhân vật
├── physics/collision.ts       Va chạm hình trụ–hộp (hàm thuần, có test)
├── world/
│   ├── World.ts               Bầu trời, ánh sáng, mặt cỏ
│   ├── ForestMap.ts           Bố cục làng trong rừng (seed cố định)
│   └── props/                 Cây/đá/bụi (InstancedMesh), nhà, giếng, thùng gỗ
├── ui/Hud.ts                  HUD và màn tạm dừng
└── utils/math.ts              clamp, damp, PRNG có seed
tests/                         Unit test cho logic thuần
```

## Nhân vật 3D

- Model: `public/models/RobotExpressive.glb` — tác giả [Tomás Laulhé (Quaternius)](https://quaternius.com), giấy phép **CC0 1.0**, lấy từ kho ví dụ của three.js.
- Có sẵn 14 animation: Idle, Walking, Running, Jump, WalkJump, Dance, Wave, Punch, Death, Sitting, Standing, ThumbsUp, Yes, No.
- **Đổi model:** bỏ file `.glb` mới vào `public/models/`, sửa `CONFIG.character.url` và tên clip trong `CONFIG.character.clips` (`src/config.ts`). Model tự co giãn về chiều cao `CONFIG.character.height`.

## Ghi chú kỹ thuật

- **Fixed timestep 60 Hz** với nội suy khi render: vật lý chạy giống nhau ở mọi FPS (60/144/240 Hz).
- **Bản đồ tái lập được**: chướng ngại vật sinh từ `CONFIG.world.seed`.
- **Tự tạm dừng** khi chuyển tab hoặc cửa sổ mất focus.
- **Giải phóng tài nguyên** (geometry, material, listener) khi hot reload để không rò bộ nhớ.
- Đổi phím ở `BINDINGS` trong `src/core/Input.ts`, đổi tốc độ/trọng lực… ở `src/config.ts`.
