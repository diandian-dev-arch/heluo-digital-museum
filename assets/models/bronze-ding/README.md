# 原创河洛风格青铜鼎模型

- 当前推荐模型：`heluo-bronze-ding-v4`（保留 v1、v2 以便追溯）。
- 类型：项目自主创作的概念展项，不是任何真实馆藏的复原或复制品。
- 创建工具：Blender 5.2.0 LTS。
- 组成：可编辑器腹、双耳、三足、抽象河洛纹样、展示台及 3 个基础 PBR 材质。

## 文件

| 文件 | 用途 |
|---|---|
| `source/heluo-bronze-ding-v4.blend` | 当前推荐的 Blender 可编辑源文件；包含精修器形、浮雕、材质、灯光、相机和渲染设置。 |
| `source/heluo-bronze-ding.blend`、`source/heluo-bronze-ding-v2.blend`、`source/heluo-bronze-ding-v3.blend` | 早期版本，保留用于追溯，不建议接入前端。 |
| `source/create_heluo_bronze_ding_v4.py` | 当前推荐模型的可重复生成 Blender Python 脚本。 |
| `source/create_heluo_bronze_ding.py`、`source/create_heluo_bronze_ding_v2.py`、`source/create_heluo_bronze_ding_v3.py` | 早期版本的生成脚本。 |
| `export/heluo-bronze-ding-v4.glb` | 当前推荐的 Three.js 可加载 GLB，约 762 KB。 |
| `export/heluo-bronze-ding.glb`、`export/heluo-bronze-ding-v2.glb`、`export/heluo-bronze-ding-v3.glb` | 早期 GLB，保留用于对比。 |
| `preview/heluo-bronze-ding-v4-cover.png` | 当前推荐模型的 Blender 渲染封面图。 |
| `verify_blend.py`、`verify_glb.py` | 源文件重开和 GLB 导入验证脚本。 |

## Three.js 使用建议

使用 `GLTFLoader` 加载当前推荐文件 `export/heluo-bronze-ding-v4.glb`；网页中设置加载状态、错误提示和移动端降级封面。接入前应在目标浏览器实际验证旋转、缩放、资源释放与性能。

## 已验证

- v4 使用标准 PBR 基础色、金属度和粗糙度，已确认这些材质参数写入 GLB；不再依赖 Blender 专有的程序噪声节点。
- v4 GLB 包含 5 种标准 PBR 材质；网站仍需提供 Three.js 灯光与环境。
- GLB 使用单文件封装，未产生需要部署的外部贴图文件。



