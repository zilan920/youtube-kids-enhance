# youtube-kids-enhance

一个「类似 YouTube Kids」的精简版 Web 应用（MVP），在保证内容更偏儿童友好（SafeSearch 严格 + `madeForKids` 强过滤）的前提下，额外提供：
- **关键字分段首页**：可在设置中配置多个关键字，首页按每个关键字分段横向滚动展示（两行视频卡片，Netflix/YT Kids 风格）
- **播放时长** 筛选：`short/medium/long` 预设 + 可选自定义最短/最长秒数
- **语言** 筛选（`relevanceLanguage` + `defaultLanguage`）

> 说明：YouTube Kids 的完整能力（家长控制、账号体系、年龄分级、白名单、离线、强审查等）非常庞大。本项目先做可运行的 MVP：关键字分段浏览 + 播放，并保留后续扩展点。

## 计划（实现路径）

### Phase 0 — 基础脚手架（已完成）
- Next.js (App Router) + TypeScript + Tailwind

### Phase 1 — 数据接入（进行中）
- 接入 **YouTube Data API v3**
- 新增 `/api/search`：根据查询 + 过滤条件返回列表
- 新增 `/api/videos`：按 id 批量取 `contentDetails(duration)`、`snippet(defaultLanguage)` 等

### Phase 2 — UI（进行中）
- 首页：
  - 顶部仅保留 `KidsTube` 标题 + **设置按钮**（齿轮图标）
  - **设置弹窗** 中配置：
    - 关键字列表（最多 6 个，每个关键字作为一段）
    - 视频时长：`any/short/medium/long` 预设 + 自定义最短/最长秒数
    - 语言：`en/zh/...`（可选）
  - 主区域：按关键字分段展示，每段左上角为小标题（关键字），右侧横向滚动两行视频卡片
  - 类型固定为 `video`（不对用户暴露），所有视频强制 `madeForKids=true`
  - 点击视频：内嵌播放器（沉浸式全屏）

### Phase 3 — 童趣/安全增强（后续）
- 默认开启 `safeSearch=strict`
- 可选：黑名单关键字、白名单频道/播放列表
- 本地收藏/最近播放

## 本地运行

1. 创建 API Key：Google Cloud Console → YouTube Data API v3 → API Key
2. 复制环境变量：

```bash
cp .env.example .env.local
```

3. 填入 `YOUTUBE_API_KEY`
4. 启动：

```bash
pnpm dev
```

打开：http://localhost:3000

## 环境变量

- `YOUTUBE_API_KEY`：必填
- `YOUTUBE_REGION_CODE`：可选，默认 `SG`

## 里程碑验收（MVP）
- [ ] 能通过设置弹窗配置关键字/时长/语言并持久化到 localStorage
- [ ] 首页按关键字分段展示，每段支持横向滚动
- [ ] 能按时长（预设 + 自定义秒数）、语言过滤
- [ ] 能播放视频
