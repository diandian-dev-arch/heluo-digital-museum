# README 截图来源

采集日期：2026-09-27（北京时间，首页首批于 20:02 采集，登录页与后台随后补拍）。来源：[河洛数字博物馆线上站点](https://heluo.pocketbay.app/)。图片仅作为项目展示素材，不代表完整业务验收。

| 文件 | 页面与模式 | 原始尺寸 |
| --- | --- | --- |
| home-dark-en.png | 首页 · 英文深色 | 1440 × 2312 |
| home-dark-zh.png | 首页 · 中文深色 | 1440 × 2312 |
| home-light-zh.png | 首页 · 中文浅色 | 1440 × 2312 |
| explore-dark-en.png | Explore · 英文深色 | 1440 × 2503 |
| shop-dark-en.png | 商城 · 英文深色、已登录 | 1680 × 1067 |
| gallery-dark-en.png | 展厅入口 · 英文深色 | 1680 × 1183 |
| digital-exhibit-dark-en.png | 3D 实体模型 · 英文深色 | 1680 × 1340 |
| booking-dark-en.png | 预约 · 英文深色、已登录 | 1680 × 1494 |
| admin-content-dark-zh.png | 内容管理 · 中文深色 | 1680 × 1725 |
| admin-content-light-zh.png | 内容管理 · 中文浅色 | 1680 × 1728 |
| admin-products-dark-zh.png | 商品管理 · 中文深色 | 1680 × 1061 |
| admin-exhibits-dark-zh.png | 3D 展项管理 · 中文深色 | 1680 × 1061 |

通过 Playwright / Edge 打开公开入口，再读取站点实际嵌入的 `https://heluo--e.pocketbay.app/` 页面。首页使用线上 `home-corridor-light-user-v2.webp` / `home-corridor-dark-user-v2.webp`；采集时主脚本为 `index-CRsUH_LY.js`。

等待字体、图片和滚动加载完成，首页/Explore 在 1440 × 900 外层视口采集，其余为 1680 × 1100。长页面以重叠滚动截图无缩放拼接；后台和预约通过增高浏览器视口一次拍完整页，避免固定侧栏重复。保留完整内容，固定导航只出现一次；无 footer 的页面按实际内容边界验收。关闭平台反馈气泡，并在截图会话中隐藏残留的平台浮层，不修改网站部署或应用内容。英文界面中缺少译文的条目按网站实际情况保留中文。

登录使用现有线上演示管理员，凭据只从 Git 忽略的配置中读取，令牌只保留在浏览器会话内存。商城沿用现有购物袋，未新增商品或提交订单；预约未提交，后台只切换展示模块。图片中的 `admin@example.test` 是演示占位邮箱，不展示用户、订单或日志明细。3D 截图已实际启动并观察到实体模型，不以封面代替。

复现命令（需安装项目开发依赖及 Edge，PowerShell 拼接依赖 Windows System.Drawing）：

```powershell
node frontend/scripts/capture-readme-home.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File frontend/scripts/stitch-readme-home.ps1
```

补拍登录后的商城与后台：通过环境变量 `HELUO_CAPTURE_CREDENTIAL_FILE` 指向获授权的本地部署 properties 文件，再运行 `node frontend/scripts/capture-readme-home.mjs --authenticated`。补拍展厅及预约使用 `--authenticated --supplement`。最后重新运行拼接脚本。勿将凭据文件或令牌上传。

原始分段与采集记录保存在被忽略的 `artifacts/readme-live-home/`，不作为发布素材提交。

## SHA-256

```text
home-light-zh.png 58413741930409B079198119535BD08D96FA3B4633D53C0DE2DCCF51A87CE6DF
home-dark-zh.png 7EBC90096ABD0C7BD255B61953BFB07C91CBA320D0D4A936C31E2F6A3C5FDBD4
home-dark-en.png 87ECAF4BFA54C5EF5ED03C59A9D52CDE4B447EC7C710063E950E5C2CE894F13D
explore-dark-en.png D9B833D3D876CF339071D5AC334DA9F470C3E88EF9E57CBEF2D517598937702A
shop-dark-en.png FA37D5F1822D82AF1F3C414D3D56AFB36C57898306ADF29AE9BA8C99856D6914
admin-content-dark-zh.png AB6B5AE79A402E6111EBB5C59E37B566AE867B368FEE010D92BE4273B5285EB0
admin-content-light-zh.png 15D736FF606DA49B1F52FECE16DACF4655643C730B0166B83314DF6DE0EF543D
admin-products-dark-zh.png E0D932C7A45CACB5A69180C0129AE7323CBA0019036758934873EE5D2DCCA619
admin-exhibits-dark-zh.png 0EB0FBF16968555A3871FFE5483D79D29B6DDC4C4293CF4618FC28E2B26DEAAA
gallery-dark-en.png A8C5A751D936ADA4AC21A1DB81B904B806C837E42710E97AF714E2DCB283814B
digital-exhibit-dark-en.png 5C2A17ACA0B2A9AE9E39D5EC43C35F199C89E2AEF1C4D88188C55A4B0BF62C1F
booking-dark-en.png 9DA1FEBD68E632EA603E08F67BB5EE74B78B3DC6C18C6CBE7BEFF78FEA27289B
```

`digital-exhibit.png` 为此前已入库的历史版本 3D 展厅图，保留文件但不再由 README 引用。器物素材来源及授权继续以项目资产台账与展项说明为准。
