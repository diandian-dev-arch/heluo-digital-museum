# Design — 河洛数字博物馆

> Hallmark 锁定设计系统。全站页面必须先读取本文件；新增页面应扩展本系统，不得自行发明另一套主题。

## Genre

`editorial`：以文物与河洛文明内容为主角，使用不对称编排、细线、留白和安静动效，不使用玻璃拟态、渐变胶囊或等宽功能卡阵列。

## Macrostructure family

- 首页：非对称策展封面；青铜鼎为唯一主视觉，馆藏和 3D 为首要入口。
- 馆藏、展厅与详情：编辑索引 + 长文档叙事；分类、时代和阅读进度构成信息骨架。
- 预约、商城、账户：策展语气下的任务工作台；步骤、摘要和主操作保持清晰。
- 后台：紧凑运营工作台；侧栏、工具栏、编辑区和记录区形成稳定四层结构。

## Theme — 河洛纸墨

- `--color-paper`：偏冷宣纸白。
- `--color-paper-2`：青灰次级纸面。
- `--color-ink`：河洛墨绿，用于标题与深色表面。
- `--color-text`：正文墨色。
- `--color-muted`：辅助信息。
- `--color-rule`：纸面分隔线。
- `--color-action`：主操作青绿。
- `--color-accent`：少量朱砂，单屏占比不超过 5%。
- `--color-bronze`：文物与年代标注。
- `--color-focus`：键盘焦点，必须同时对纸面和按钮可见。

所有颜色和字体声明引用命名令牌；禁止在页面局部临时添加 hex、rgb 或独立字体。

## Typography

- Display：`Noto Serif SC Variable`，560–700，始终为正体。
- Body：`Noto Sans SC Variable`，400–650。
- Data：正文无衬线字体配合等宽数字特性。
- 标题允许自然断行并设置 `overflow-wrap: anywhere`；交互标签始终单行。

## Spacing

4px 基准：`--space-1` 至 `--space-24`。页面只使用命名间距；紧凑后台仍遵循同一尺度。

## Motion

- 页面进入：单次透明度 + 8px 位移，220–360ms。
- 按压：最多 1px 位移或 0.98 缩放；不使用弹跳装饰。
- `prefers-reduced-motion: reduce`：取消位移和连续动画，时长不超过 150ms。
- 3D 相机动效保持可中断；页面离开时继续释放 Three.js 资源。

## Controls and states

- 输入框与按钮高度至少 44px，边框宽度在所有状态保持 1px。
- 默认、hover、focus、active、disabled、loading、error、success 均有视觉或语义反馈。
- 错误状态说明原因和下一步；空状态提供可执行入口；列表加载优先骨架。
- 主按钮为青绿实底直角小圆角；次按钮为纸面描边；危险操作使用朱砂但不依赖颜色单独传意。

## Responsive

- 基准宽度：320、375、414、768、1440px。
- `html` 和 `body` 使用 `overflow-x: clip`；禁止 `100vw`。
- 图片网格轨道使用 `minmax(0, 1fr)`；移动端标题可在长词内部换行。
- 移动端保留五项底部导航；任务摘要使用 Bottom Sheet；后台表格转为记录卡。

## Hallmark stamp

`/* Hallmark · pre-emit critique: P5 H4 E4 S5 R4 V5 · genre: editorial · macrostructure: museum editorial system · design-system: design.md · designed-as-app */`
