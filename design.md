# Design — 河洛数字博物馆

> Hallmark 锁定设计系统。全站页面必须先读取本文件；新增页面应扩展本系统，不得自行发明另一套主题。

## Genre

`editorial`：以文物与河洛文明内容为主角，使用不对称编排、细线、留白和安静动效；允许受控的博物馆玻璃材质承载导航、浮层和信息看板，但禁止无节制玻璃拟态、渐变胶囊或等宽功能卡阵列。

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

### Museum glass contract

所有毛玻璃表面必须通过 `data-glass="light|dark|compact"` 选择既定材质，不得在页面规则中自行声明透明背景、模糊、边框或阴影。

- `light`：通透月白青玉，用于导航、浅色看板、预约、商城和后台浅色工作面；底色保持近中性，仅保留极轻青玉色相。
- `dark`：通透深墨玉，用于路线、图片信息叠层、3D 信息板、账户和后台侧栏；使用低彩度墨绿色与中性高光，不允许厚重纯绿底板。
- `compact`：紧凑月白，用于输入、筛选、标签、次级按钮和小型状态控件；继承 light 色相并使用更轻的阴影。

三个层级共享同一低彩度青绿色相、细边框、中性高光方向、8px/6px 圆角比例和无弹跳交互；只有表面明度与信息密度可以变化。正常模式必须让背景环境可感知，高彩度绿色和高不透明度底板均视为材质漂移。减少透明度、高对比度和强制颜色模式必须使用对应的低彩度实色令牌降级。

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

`/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 · genre: editorial · macrostructure: museum editorial system · design-system: design.md · designed-as-app */`
