# Cleveland CC0 参考青铜鼎 v5.2 实施记录

**日期：** 2026-08-01
**关联需求：** F-05、A-02、N-03、N-06

## 目标

在无法登录 Sketchfab 下载网格的情况下，改用 Cleveland Museum of Art 开放 API 中 `Tripod Cauldron (Ding)`（登录号 `1960.288`）的 CC0 多视图图片作为可追溯参考，创建可在现有 Three.js 点云展厅加载的 v5.2 GLB。保留 v5.1 作为回退资产。

## 范围与来源

- 官方对象页：<https://www.clevelandart.org/art/1960.288>
- Open Access API：<https://openaccess-api.clevelandart.org/api/artworks/1960.288>
- 图片许可：CC0 Public Domain。
- 下载图片、URL、SHA-256、下载日期和用途保存在 `assets/models/bronze-ding/reference/cleveland-cma-1960-288/`。
- v5.2 为项目重新建模和材质重制，不包含 Sketchfab 下载网格，不宣称为馆方扫描数据或官方复原。

## 实施

1. 下载官方 CC0 主视图与 7 张多视图参考，建立来源清单。
2. 新建 `heluo-bronze-ding-v5.2.blend` 与可重复 Blender Python 脚本：重建紧凑椭圆器腹、短方圆双耳、三足、上部回纹带、分区兽面纹样和足部小饰纹。
3. 生成 2K Base Color、Normal、Metallic-Roughness、AO 源贴图；GLB 内嵌 WebP 贴图。材质采用深褐黑、灰铜、凹槽局部暗青铜绿和磨损边缘，不使用整体绿色或自发光。
4. 生成主视图和四视图验证渲染；导出 `heluo-bronze-ding-v5.2.glb`。
5. 将 GLB、WebP 封面复制到前端静态资源，使用 Flyway V10 更新已发布展项，开发初始化数据同步 v5.2 资产引用。
6. 不修改 `ThreeExhibitViewer` 接口，沿用现有实体/点云、旋转、缩放、重置、移动端降级和失败封面逻辑。

## 影响文件

- `assets/models/bronze-ding/source/create_heluo_bronze_ding_v5_2.py`
- `assets/models/bronze-ding/source/heluo-bronze-ding-v5.2.blend`
- `assets/models/bronze-ding/export/heluo-bronze-ding-v5.2.glb`
- `frontend/public/media/models/heluo-bronze-ding-v5.2.glb`
- `frontend/public/media/exhibits/heluo-bronze-ding-v5.2-cover.webp`
- `backend/src/main/resources/db/migration/V10__upgrade_heluo_bronze_ding_to_v5_2.sql`
- `backend/src/main/java/com/heluo/museum/config/BootstrapDataInitializer.java`

## 验收标准与结果

| 验收项 | 结果 |
|---|---|
| Blender 源文件可重开，GLB 可重新导入 | 通过；低模 95 个对象，重新导入得到 95 个网格、5 个材质、3 张嵌入图片。 |
| GLB 小于 6MB | 通过；1,188,980 B。 |
| v5.1 可回退 | 通过；v5.1 源文件、导出文件、V9 迁移均未改写。 |
| 后端展项资产改为 v5.2 | 通过；Docker/Flyway 部署后接口返回 v5.2 URL、封面 URL 和 1,188,980 B。 |
| 静态资源可用 | 通过；GLB HTTP 200、1,188,980 B；封面 HTTP 200、28,024 B。 |
| 前端点云接口保持不变 | 通过；桌面 Chrome 完成加载、实体→点云→实体切换，控制台无错误或警告。 |
| 移动端基础回归 | 通过；390×844 触摸模拟加载模型和移动信息入口，控制台无错误或警告。 |

## 风险与后续

- v5.2 是以公开多视图为依据的网页级重建，不等同于高精度扫描；若需要接近馆藏级浮雕，应取得可用扫描网格或进行人工高模雕刻与烘焙。
- 真实手机性能和真机触摸仍需最终验收；若帧率不足，只降低点云数量和后处理，不替换实体材质。
