# GitHub Pages 部署

PhraseWeave 的前端可以部署到 GitHub Pages，但练习同步使用的 WebSocket 信令服务不能运行在 GitHub Pages 上，需要另外部署 `apps/signal-worker`。

## 1. 部署同步 Worker

在本地登录 Cloudflare 并部署 Worker：

```bash
pnpm --filter signal-worker exec wrangler login
pnpm --filter signal-worker run deploy
```

部署完成后记下 Worker 根地址，例如：

```text
https://phraseweave-course-signal.example.workers.dev
```

客户端会自动补上 `/room/<房间令牌>`；如果已经配置了带 `/room` 的地址也可以继续使用。

## 2. 配置 GitHub Actions Variable

在 GitHub 仓库打开 `Settings → Secrets and variables → Actions → Variables`，新增：

```text
EXERCISE_SYNC_SIGNAL_URL=https://phraseweave-course-signal.example.workers.dev
```

这是公开前端配置，不要放在 Secret 里也可以；Worker 不保存练习内容，只负责临时转发 WebRTC 信令。

## 3. 开启 Pages

在 `Settings → Pages → Build and deployment` 中选择 `GitHub Actions`。

仓库已有 `.github/workflows/pages.yml`。推送到 `main` 后，它会构建 `apps/client` 并发布到：

```text
https://<github-用户名>.github.io/phraseweave/
```

工作流会把 `EXERCISE_SYNC_SIGNAL_URL` 注入生产构建；如果没有配置该 Variable，练习同步会提示“未配置练习同步服务”。
