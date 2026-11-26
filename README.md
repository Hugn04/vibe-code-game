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
| Chuột             | Nhìn / ngắm |
| E (hoặc F)        | Mở / đóng cửa · Lên / xuống xe |
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

## Bản đồ

Chọn ở `CONFIG.world.map` (`src/config.ts`):

- **`hospital`** (mặc định) — bệnh viện **2 tầng** có cầu thang, 15 cánh cửa mở/đóng được (E). Tầng 2: phòng bệnh 201–204, hồi sức, phòng bác sĩ, xét nghiệm, sảnh chờ có lan can. Tầng 1: sảnh + quầy lễ tân + ghế chờ, hành lang, 4 phòng bệnh (giường, rèm, cột truyền dịch), phòng mổ, kho thuốc, phòng khám; bên ngoài có mái sảnh, biển tên, bãi đỗ xe, đèn đường, cây xanh. Code: `src/world/HospitalMap.ts`, đồ đạc dựng bằng code ở `src/world/props/hospital.ts`.
- **`forest`** — làng nhỏ trong rừng. Code: `src/world/ForestMap.ts`.

Tường, sàn, đồ đạc tĩnh được gộp theo vật liệu (`StaticBatch`) để giảm draw call.

## Tài nguyên (assets)

| File | Nguồn | Giấy phép |
| --- | --- | --- |
| `public/models/man.glb` — nhân vật (walk, run) | grab3d.com — *Man Base Mesh (rigged)*, tối ưu bằng gltf-transform | CC0 1.0 |
| `public/models/car.glb` — ô tô lái được | [Khronos glTF Sample Assets — *Car Concept*](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept), Eric Chadwick / Darmstadt Graphics Group (tối ưu bằng gltf-transform) | **CC-BY 4.0** — bắt buộc ghi công như dòng này. Logo Khronos trên xe là nhãn hiệu của Khronos Group |
| `public/models/RobotExpressive.glb` (dự phòng) | Tomás Laulhé (Quaternius), kho ví dụ three.js | CC0 1.0 |
| `public/models/env/*.glb` — đá, gốc cây, bụi, thùng, bếp lửa; ghế, bàn, kệ, chậu cây, đồng hồ, TV, hộp y tế, đèn đường… | Poly Haven (`npm run assets`) | CC0 |
| `public/textures/*` — cỏ, đất, tường gỗ/vữa, mái ngói/đá phiến, đá, gỗ, gạch lát, trần, vữa trắng, nhựa đường, vỉa hè | Poly Haven | CC0 |
| `public/hdri/sky_1k.hdr` | Poly Haven — *Kloofendal 48d Partly Cloudy (Pure Sky)* | CC0 |
| Cây (sinh bằng code) | thư viện [ez-tree](https://github.com/dgreenheck/ez-tree) của Dan Greenheck | MIT |

Tất cả tài nguyên trên dùng được cho game thương mại. Riêng ez-tree là MIT: giữ thông báo bản quyền của thư viện khi phân phối (đã có sẵn trong `node_modules/@dgreenheck/ez-tree/LICENSE`).

**Đứng yên, ngồi xổm, đi khom, nằm sấp, bò** không cần có sẵn trong file model: `PoseBuilder` tự dựng tư thế và chu kỳ bước bằng cách xoay từng khúc xương theo hướng mong muốn (chỉnh dáng ở `POSES` trong `src/entities/PoseBuilder.ts`). Model nào có sẵn clip thì khai báo trong `CONFIG.character.clips` để dùng clip đó.

**Đổi nhân vật:** bỏ file `.glb` vào `public/models/`, sửa `CONFIG.character` trong `src/config.ts`: `url`, tên clip trong `clips` (chỉ cần những clip model có; idle/ngồi/nằm tự dựng), `rotationY` nếu model nhìn ngược. Model tự co giãn về chiều cao `height`.

## Lái ô tô

Đi tới xe đỏ ở bãi đỗ, nhìn vào xe và bấm **E**. Trong xe: **W** ga · **S** phanh (gần đứng yên thì lùi) · **A/D** lái · **Space** phanh tay · **L** đèn pha · **E** xuống xe (phải dừng hẳn). Chuột: quay đầu nhìn quanh trong cabin.

- Vật lý (`src/vehicle/CarPhysics.ts`, có unit test): bicycle model có trượt lốp, giới hạn bám × tải trục (chuyển tải khi tăng tốc/phanh), động cơ có đường cong mô-men xoắn, hộp số tự động 6 cấp + lùi (giới hạn ~29 km/h), phanh, phanh tay (đuôi xe trượt), cản gió, cản lăn, vô-lăng giảm góc khi chạy nhanh. Kết quả: 0–100 km/h ~4.8 s, tối đa ~226 km/h, phanh 100→0 ~39 m.
- Hình ảnh (`src/vehicle/CarModel.ts`): bánh quay + bẻ lái, má phanh đứng yên, vô-lăng xoay (tỉ số ~14:1), thân xe chúi/ngửa/nghiêng theo gia tốc, đèn pha.
- Va chạm (`src/vehicle/Car.ts`): thân xe = 3 vòng tròn, nảy nhẹ khi đâm; xe cũng là vật cản với người đi bộ.
- Âm thanh (`src/audio/EngineSound.ts`): tiếng động cơ + rít lốp tổng hợp bằng Web Audio, theo vòng tua/ga/độ trượt.

## Góc nhìn thứ nhất với thân thật

- Camera đặt ở **mắt của model** (xương đầu): đi, ngồi xổm, nằm sấp… tầm mắt đi theo cơ thể thật.
- Cúi xuống thấy thân + chân. Phần đầu chỉ bị cắt với camera chính (mặt phẳng cắt ở cổ), nên **gương và bóng đổ vẫn thấy đầy đủ**.
- Đầu + cổ cúi/ngẩng theo hướng nhìn (soi gương thấy rõ).
- Gương soi thật (`Reflector`) ở tường đông sảnh tầng 1 và 2.

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
