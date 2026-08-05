# 展品深度内容与页面构图精修计划

## 目标

- 为现有五件概念展品补充具有观察路径、文化语境和当代价值的完整正文。
- 压缩数字展厅简介看板，减少无效留白。
- 恢复商城三张商品卡片的错落构图，避开背景商品主体。
- 调整青铜鼎正面缩略图的拍摄距离，使主体占比接近左右视角。

## 关联需求

- F-02 公开内容浏览与检索
- F-05 3D 数字展项
- F-09 文创商城
- N-03 响应式与视觉可用性
- N-06 资源来源与可维护性

## 影响范围

- `frontend/src/assets/main.css`
- `frontend/src/views/ExhibitDetailView.vue`
- `frontend/public/media/exhibits/views/`
- `backend/src/main/java/com/heluo/museum/config/BootstrapDataInitializer.java`
- `backend/src/main/resources/db/migration/V19__expand_artifact_editorial_content.sql`

## 实施步骤

1. 规范正面视角缩略图的相机距离和画布。
2. 桌面商城采用三张小型错落玻璃卡片，移动端保留顺序单列。
3. 收紧数字展厅简介看板的宽度、网格、字号和内边距。
4. 扩写五件展品正文，同时覆盖新建数据库和已存在数据库。
5. 运行前后端检查、迁移测试、Docker 重建和浏览器回归。

## 验收标准

- 正面鼎主体占比与左右视角接近，五张图片区域尺寸一致。
- 三张商品卡片不平行排布，不遮挡背景中的茶具和织物主体。
- 数字展厅简介不再形成大面积空卡片。
- 五件展品均至少包含五个层次的专题阅读内容。
- 类型检查、前端测试/构建、后端测试、迁移和实页检查通过。

## 风险

- 桌面错落布局必须在窄桌面断点回退，避免卡片重叠。
- 文章内容为项目组策展性原创说明，不应表述为真实馆藏考据结论。

## 验证结果

- 五件展品正文已同步到初始化器和 Flyway V19；三篇专题文章由 V20 延续相同的新库/旧库一致性策略。
- `mvn test`：12 项通过，空 H2 数据库成功执行 Flyway V1–V20。
- `pnpm typecheck`、17 个测试文件 60 项、`pnpm build`、指针性能/体积和 16 组页面映射门禁通过。
- 正式视角资源保存在 `frontend/public/media/exhibits/views/`，完整图与缩略图均纳入资源说明；本轮提交前未重新进行实体手机复测。
