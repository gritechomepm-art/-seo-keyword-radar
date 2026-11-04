# SEO Keyword Radar V1.4 · GitHub Pages

一个专为**美国国家公园旅行规划**研究打造的私人 Google Sheets 工作台。前端使用纯 HTML/CSS/JavaScript，可部署到 GitHub Pages。**代码仓库不包含任何用户关键词、竞品数据、Google 凭证或 API 密钥。**

## 功能

- Google Identity Services (GIS) 浏览器 OAuth 授权读取私人 Google Sheets
- 读取 `Untitled` 原始关键词、`国家公园_候选池_20261103`、`国家公园_真实同行_20261103`
- 自动排除 AI 发型和 RV / 泛户外电力示例，聚焦国家公园研究
- 批量添加候选关键词（自动去重，写入候选词工作表）
- 审核状态和备注写入 `04_国家公园_审核记录`（首次写入时自动新建）
- 页面打开后手动授权即同步；保持在线且授权有效时每 5 分钟拉取一次
- 浏览器本地缓存、离线待同步队列、重连后同步和审核冲突提示
- JSON 备份、审核 CSV 导出

> 免费 API 与否：本项目只调用 Google Sheets API，不调用 DataForSEO，也不会自动运行任何付费关键词查询。

## 1. 当前 GitHub 仓库与 Pages 发布

1. 代码已提交至 [gritechomepm-art/-seo-keyword-radar](https://github.com/gritechomepm-art/-seo-keyword-radar) 的 `main` 分支，无需再上传 ZIP。
2. 本仓库当前为 **Private**。GitHub Free 使用 Pages 需要 **Public** 仓库；请在 Settings → General → Danger Zone → Change repository visibility 中自行改为 Public，**仅在确认仓库不含私有资料后操作**。若有支持私人仓库 Pages 的付费套餐，可保持 Private。
3. Settings → Pages → Build and deployment → **Deploy from a branch** → `main` → `/(root)` → Save。
4. Pages 发布成功后，在 Settings → Pages 复制实际 Visit site 链接；按当前仓库名，预期是：

   `https://gritechomepm-art.github.io/-seo-keyword-radar/`

**不要将私有 Google Sheets 导出数据、JSON 备份、OAuth token 或服务账号私钥上传到仓库。**

> GitHub Pages 网站本身公开可访问，即使仓库是私有的（在受支持方案下）。只有通过拥有 Sheets 权限的 Google 账号授权后，网页才会读取数据。静态站点不是身份验证或数据授权服务。

## 2. Google Cloud 授权配置（一次性）

1. 打开 https://console.cloud.google.com/apis/library/sheets.googleapis.com 并对项目启用 **Google Sheets API**。
2. 进入 Google Auth Platform / OAuth consent screen。若应用处于 Testing，添加拥有两张 Sheets 权限的 Google 账号为测试用户。
3. 创建 OAuth Client → Application type：**Web application**。
4. Authorized JavaScript origins 添加 `https://gritechomepm-art.github.io`（**只添加 origin，不含 `/-seo-keyword-radar/` 路径**）。若使用自定义域名，应添加实际 HTTPS origin。
5. 复制 Web Client ID（形如 `....apps.googleusercontent.com`）。这不是密码。
6. 打开已发布的 Dashboard → 「云端连接与备份」：分别填写 OAuth Client ID、关键词 Sheet ID、竞品 Sheet ID。
7. 保存配置 → 「连接 Google」，使用拥有两份 Sheet 权限的账号批准访问。必要时按 Google 的测试应用提示完成授权。

OAuth scope：`https://www.googleapis.com/auth/spreadsheets`。网页通过 Google Identity Services token model 获取临时访问令牌，随后直接向 Sheets REST API 发起浏览器 CORS 请求。**令牌仅保存在当前网页运行内存，不存入 localStorage 或 GitHub。**

## 3. 原有数据映射

| 数据 | 表格名称 | 范围 |
|---|---|---|
| 原始关键词 | `Untitled`（关键词表） | `A1:K` |
| 国家公园候选词 | `国家公园_候选池_20261103`（关键词表） | `A1:N` |
| 审核记录 | `04_国家公园_审核记录`（关键词表，首次保存时自动建立） | `A1:D` |
| 竞品候选池 | `国家公园_真实同行_20261103`（竞品表） | `A1:J` |

关键词和竞品 Spreadsheet ID **不会出现在 GitHub 文件里**；请从你自己的 Google Sheets URL `/spreadsheets/d/<ID>/edit` 复制填入 Dashboard。

首次实际登录 Google 后才显示记录；目前无任何私有数据写入 GitHub。当前预期初始计数：正式国家公园 16 条、候选 9 条、竞品 3 家。计数依据现有归档；以后可能随源表变化。

## 4. 日常使用与同步限制

- 在线：点击「连接 Google」授权，之后同步；页面保持打开会每 5 分钟轮询。
- 离线：查看本地缓存，新增候选词和编辑审核保存在浏览器，进入待同步队列。
- 恢复网络：若当前短期令牌仍有效会自动尝试提交；若过期，必须再次点击连接并授权。**不会静默长期存储 Google OAuth token。**
- 审核冲突：如果云端审核记录在离线期间被其他设备更新，默认停止覆盖并提示；用户可明确确认用本地版本覆盖。
- 缓存是浏览器 localStorage（与站点 origin 绑定），不是独立磁盘数据库；清除浏览器网站数据可能造成丢失。定期导出 JSON。
- Google Sheets 变更不是实时推送；这里使用 5 分钟轮询。
- 首次登录、云端读取和写入需要网络，网站并未实现离线 Service Worker 预缓存；断网期间**已打开**的页面可使用缓存，断网后**重新打开**网站不保证可用。

## 5. 部署验收

- [ ] GitHub Pages URL 能打开，界面不报 JavaScript 错误
- [ ] 首次打开需要填写 Client ID 和两张表 ID，不出现写死的私人数据
- [ ] 使用 Google 登录成功，看到正式 16 / 候选 9 / 竞品 3（以实际表格为准）
- [ ] 新增一个测试候选词，Google Sheets 里出现并能去重
- [ ] 保存审核状态，`04_国家公园_审核记录` 中有记录
- [ ] 刷新页面重新授权后能读回审核状态
- [ ] 切断网络时仍可在已打开页面里操作，再联网后手动授权同步
- [ ] JSON 导出能下载，不包含 OAuth access token

## 6. 常见错误

- `origin_mismatch` / `The given origin is not allowed`：Google OAuth Client 的 Authorized JavaScript origins 没包含实际网站 HTTPS origin。
- `access_denied`：OAuth 测试用户未包含当前 Google 账号，或没有授权 Google Sheets scope。
- `403 PERMISSION_DENIED`：Google 账号未获得对应 Google Sheets 权限，或 Google Sheets API 未启用。
- `404 not found` / `Unable to parse range`：检查 ID 或工作表名称是否与上方完全一致。
- 已连接但显示 0 条：检查原表列结构和关键字是否属于国家公园前缀；AI 发型、RV 电力示例被刻意排除。
- 审核队列有“冲突”：另一设备改动过同一词。核对后再点击明确的覆盖按钮。

## 安全边界

- GitHub Pages 公开网页不是私有登录系统。Google OAuth 负责授权 Sheets 内容，仓库不得包含任何个人源数据。
- OAuth Client ID 是公开客户端标识；**客户端密钥、服务账号私钥和 refresh token 永远不能放入浏览器代码**。
- 不使用旧 Apps Script HTML Service / `google.script.run`，不依赖 Chrome 的 Google Apps Script 授权弹窗桥接。
- 如果需要更强的账号级访问控制、后台定时抓数或长期稳定离线启动，需要未来另加受保护的服务器或安全身份网关。