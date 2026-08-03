# 青铜鼎 v5.3 古青铜材质精细化实施记录

## 目标

以 Cleveland Museum of Art `1962.281 Tripod (Ding)` 的 CC0 原始 GLB 为基础，保留原器型和纹样，制作真实古铜色材质、网页低模和可追溯的独立 v5.3 资产。v5.2 不覆盖，作为回退版本。

## 已实施

- 使用 Blender 5.2 导入只读原始模型，清理场景对象，统一展示比例，保留 UV，并对高密度网页网格使用 0.52 比例减面。
- 新建 2K Base Color、Normal、Metallic-Roughness、AO 四张 PBR 源贴图。
- 材质基调为深褐黑、灰铜和暖色边缘磨损；铜绿通过低饱和氧化遮罩限制在局部凹槽和接缝；无整体绿色和发光材质。
- 根据黑金古铜效果图再次校正为深橄榄灰主体、可见青铜绿凹槽和暖金边缘，新增暖金展台内圈；Three.js 环境反射从 0.32 提升至 0.48，避免网页实体模式吞掉纹样。
- 新建暖色主光、冷色补光、顶部轮廓光和深色石材展台，输出主视图及四视图。
- 导出内嵌 WebP 的 v5.3 GLB，文件大小 5,184,352 B，低于 6MB 目标。
- V11/V12/V13 保持历史迁移不变，新增 V14 修正最终中性古铜灯光平衡后的实际字节数；v5.2/v5.1 文件保持可回退。

## 产物

- `assets/models/bronze-ding/source/heluo-bronze-ding-v5.3.blend`
- `assets/models/bronze-ding/source/create_heluo_bronze_ding_v5_3.py`
- `assets/models/bronze-ding/export/heluo-bronze-ding-v5.3.glb`
- `assets/models/bronze-ding/preview/heluo-bronze-ding-v5.3-cover.png`
- `assets/models/bronze-ding/preview/v5.3-front.png`、`v5.3-right.png`、`v5.3-back.png`、`v5.3-top.png`
- `frontend/public/media/models/heluo-bronze-ding-v5.3.glb`
- `frontend/public/media/exhibits/heluo-bronze-ding-v5.3-cover.webp`
- `assets/models/bronze-ding/source/heluo-bronze-ding-v5.3-SOURCE.md`

## 验证结果

- Blender 5.2 重开源文件并重新导入 GLB：通过；3 个网格、1 个古青铜材质、3 张内嵌贴图。
- GLB 体积检查：通过，5,184,352 B。
- 多视图渲染：已生成正面、侧面、背面、俯视和封面预览。
- 前端类型检查、7 项单元测试和生产构建：通过；后端 Maven 测试 6 项通过，Flyway 在 H2 测试库成功执行至 V14。
- 浏览器交互与真实手机性能：仍待补充完整回归。
- Docker/Flyway V11/V12/V13/V14 重建：通过；`/api/v1/exhibits/heluo-bronze-ding-3d` 返回 v5.3 URL、封面 URL 和 5,184,352 B，GLB 静态资源 HTTP 200。
- 真实手机性能、长时间点云帧率和项目组最终美术验收：待执行。
