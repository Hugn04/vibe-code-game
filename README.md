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
| `npm run assets`    | Tải + tối ưu lại model/texture Poly Haven |

## Điều khiển

| Phím              | Hành động       |
| ----------------- | --------------- |
| WASD / mũi tên    | Di chuyển       |
| Shift             | Chạy nhanh      |
| Space             | Nhảy            |
| C / Ctrl          | Ngồi xổm, đi khom được (bấm lại để đứng) |
| Z                 | Nằm sấp, bò được (bấm lại để đứng) |
| Chuột             | Ngắm / xoay camera |
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
├── entities/
│   ├── Player.ts              Nhân vật: vật lý, tư thế (đứng/ngồi/nằm), chọn animation
│   ├── CharacterModel.ts      Nạp model có khung xương, cross-fade animation
│   └── PoseBuilder.ts         Dựng tư thế ngồi/nằm/đứng cho rig bất kỳ
├── render/PostFX.ts           Hậu kỳ: GTAO, Bloom, SMAA
├── camera/ThirdPersonCamera.ts Camera quay quanh nhân vật
├── physics/collision.ts       Va chạm hình trụ–hộp (hàm thuần, có test)
├── world/
│   ├── World.ts               Bầu trời, ánh sáng, mặt cỏ
│   ├── ForestMap.ts           Bố cục làng trong rừng (seed cố định)
│   └── props/                 library (nạp glb, sinh cây ez-tree), nature (instancing, shader lá), buildings (nhà, giếng)
├── ui/Hud.ts                  HUD và màn tạm dừng
└── utils/math.ts              clamp, damp, PRNG có seed
tests/                         Unit test cho logic thuần
scripts/fetch-assets.mjs       Tải + tối ưu tài nguyên Poly Haven (npm run assets)
```

## Tài nguyên (assets)

| File | Nguồn | Giấy phép |
| --- | --- | --- |
| `public/models/man.glb` — nhân vật (walk, run) | grab3d.com — *Man Base Mesh (rigged)*, tối ưu bằng gltf-transform | CC0 1.0 |
| `public/models/RobotExpressive.glb` (dự phòng) | Tomás Laulhé (Quaternius), kho ví dụ three.js | CC0 1.0 |
| `public/models/env/*.glb` — đá, gốc cây, thân cây đổ, bụi, dương xỉ, thùng gỗ, thùng rượu, bếp lửa | Poly Haven (`npm run assets`) | CC0 |
| `public/textures/*` — cỏ, đất, tường gỗ/vữa, mái ngói/đá phiến, đá, gỗ | Poly Haven | CC0 |
| `public/hdri/sky_1k.hdr` | Poly Haven — *Kloofendal 48d Partly Cloudy (Pure Sky)* | CC0 |
| Cây (sinh bằng code) | thư viện [ez-tree](https://github.com/dgreenheck/ez-tree) của Dan Greenheck | MIT |

Tất cả tài nguyên trên dùng được cho game thương mại. Riêng ez-tree là MIT: giữ thông báo bản quyền của thư viện khi phân phối (đã có sẵn trong `node_modules/@dgreenheck/ez-tree/LICENSE`).

**Đứng yên, ngồi xổm, đi khom, nằm sấp, bò** không cần có sẵn trong file model: `PoseBuilder` tự dựng tư thế và chu kỳ bước bằng cách xoay từng khúc xương theo hướng mong muốn (chỉnh dáng ở `POSES` trong `src/entities/PoseBuilder.ts`). Model nào có sẵn clip thì khai báo trong `CONFIG.character.clips` để dùng clip đó.

**Đổi nhân vật:** bỏ file `.glb` vào `public/models/`, sửa `CONFIG.character` trong `src/config.ts`: `url`, tên clip trong `clips` (chỉ cần những clip model có; idle/ngồi/nằm tự dựng), `rotationY` nếu model nhìn ngược. Model tự co giãn về chiều cao `height`.

## Đồ họa

- Bầu trời HDRI làm nền + ánh sáng môi trường, tone mapping ACES, bóng đổ 4096 px.
- Máy tính: hậu kỳ GTAO (bóng tối góc khe), Bloom, SMAA (`src/render/PostFX.ts`). Điện thoại tắt hậu kỳ, bóng 1024 px.
- Shader lá cây (`src/world/props/nature.ts`): đung đưa theo gió, tự mờ khi sát camera hoặc che nhân vật.
- `CONFIG.player.faceAimDirection`: `false` = nhân vật quay theo hướng đi, `true` = quay theo hướng ngắm.

## Ghi chú kỹ thuật

- **Fixed timestep 60 Hz** với nội suy khi render: vật lý chạy giống nhau ở mọi FPS (60/144/240 Hz).
- **Bản đồ tái lập được**: chướng ngại vật sinh từ `CONFIG.world.seed`.
- **Tự tạm dừng** khi chuyển tab hoặc cửa sổ mất focus.
- **Giải phóng tài nguyên** (geometry, material, listener) khi hot reload để không rò bộ nhớ.
- Đổi phím ở `BINDINGS` trong `src/core/Input.ts`, đổi tốc độ/trọng lực… ở `src/config.ts`.
