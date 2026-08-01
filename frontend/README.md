# 前端工程

Vue 3 + TypeScript + Vite 单页应用骨架。

```powershell
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

容器环境由 `Dockerfile` 构建，Nginx 将 `/api/` 反向代理给 Compose 中的 `backend` 服务。
