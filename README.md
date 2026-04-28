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
- `NEXT_PUBLIC_YOUTUBE_PLAYER_MODE`：可选，默认 `iframe`；设置为 `plyr` 时启用 Plyr 播放器 PoC

## 里程碑验收（MVP）
- [ ] 能通过设置弹窗配置关键字/时长/语言并持久化到 localStorage
- [ ] 首页按关键字分段展示，每段支持横向滚动
- [ ] 能按时长（预设 + 自定义秒数）、语言过滤
- [ ] 能播放视频

## 播放器方案调研 / PoC

### 结论

Plyr 可以作为 YouTube 播放器 PoC，用来验证更好的控件体验、全屏、键盘操作、事件统一和加载体验；但它不能绕过 YouTube 官方限制。生产默认仍保持官方 YouTube iframe + IFrame API，先提升可播放率和失败兜底，再评估是否切换默认播放器。

### 方案对比

| 方案 | 适用场景 | 收益 | 边界 |
| --- | --- | --- | --- |
| `iframe + IFrame API` | 生产基线 | 合规、官方支持、错误码清晰、移动端行为可预期 | UI 定制空间有限，仍受嵌入许可、地区和版权限制 |
| `Plyr` | PoC / A-B 验证 | 控件体验更统一，支持 YouTube/Vimeo/HTML5 统一 API 和事件 | 仍基于 YouTube iframe，不能解决不可嵌入、地区限制、版权限制或自动播放策略 |
| `lite-youtube` / `@next/third-parties` | 视频卡片、打开播放器前的占位加载 | 优化首屏加载，减少初始化成本 | 主要解决加载性能，不解决播放器能力和播放限制 |

### 当前 PoC 实现

- 已安装官方 `plyr` 包，不引入 React wrapper。
- 新增 `VideoPlayer` client component，支持 `PlayerMode = 'iframe' | 'plyr'`。
- 默认使用 `iframe`，通过 `NEXT_PUBLIC_YOUTUBE_PLAYER_MODE=plyr` 启用 Plyr PoC。
- 两种模式都使用 `youtube-nocookie.com`、`playsinline=1`、`enablejsapi=1`、`origin=<当前 origin>`。
- 保留现有沉浸式播放弹层，实际播放器由 `VideoPlayer` 承载，便于后续 A/B 比较。
- 捕获播放器错误并展示儿童友好的兜底文案；`101/150` 视为禁止嵌入，`153` 视为 Referer/Origin 身份问题，自动播放失败降级为提示用户手动点击播放。

### 可播放率增强

当前 API 请求先用 `search.list` 获取候选视频，再用 `videos.list` 读取详情并过滤：

- `search.list` 对视频搜索增加 `videoEmbeddable=true` 和 `videoSyndicated=true`，优先只拿可嵌入、可在 YouTube 站外播放的视频。
- `videos.list` 读取 `status.embeddable` 和 `contentDetails.regionRestriction`。
- 列表接口过滤 `madeForKids !== true`、`embeddable !== true`、当前 `YOUTUBE_REGION_CODE` 不可播放、时长不符合条件的视频。

### 合规和限制

- 不能遮挡、篡改或替代 YouTube 官方播放器的必要体验。
- `rel=0` 不能彻底关闭推荐，只能限制推荐来源行为。
- `modestbranding` 已被标记为 deprecated 且无效果；`showinfo` 不作为核心能力依赖。
- YouTube 嵌入仍受视频所有者嵌入许可、地区/版权、浏览器自动播放策略、Referer/Origin 身份要求影响。
- 本项目只过滤和兜底明显不可播放的视频，不承诺达到 YouTube Kids 的完整审核、账号、家长控制或分级能力。

### PoC 验收标准

- `iframe` 和 `plyr` 两种模式都能打开、关闭弹层，并在关闭时释放播放器。
- 正常 made-for-kids 视频可播放。
- 不可嵌入或当前地区不可播放的视频不会进入列表，或播放失败时有兜底提示。
- 移动端 `playsinline` 行为正常。
- 浏览器阻止自动播放时不黑屏，允许用户手动点击播放。
- Plyr 只有在合规、移动端体验和错误兜底都通过后，才考虑设为默认播放器。

参考资料：
- [Plyr README](https://github.com/sampotts/plyr)
- [YouTube Player Parameters](https://developers.google.com/youtube/player_parameters)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube API Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [YouTube Data API `search.list`](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube Data API `videos`](https://developers.google.com/youtube/v3/docs/videos)
