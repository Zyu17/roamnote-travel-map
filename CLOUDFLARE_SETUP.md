# 漫游记 Cloudflare Workers 发布准备

本项目通过 GitHub Actions 发布到 Cloudflare Workers。每次推送 `main` 都会构建并发布。

## 一次性配置

1. 在 Cloudflare 创建 Worker，名称为 `roamnote-travel-map`。
2. 在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 添加：
   - `CLOUDFLARE_API_TOKEN`：仅授予该账号的 Workers 编辑权限。
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账号 ID。
   - `AMAP_JS_KEY`、`AMAP_SECURITY_CODE`、`AMAP_WEB_SERVICE_KEY`：高德的三项配置。
3. 推送 `main`，Actions 会发布到 `https://roamnote-travel-map.<你的子域>.workers.dev`。

## D1 数据库（下一阶段）

创建独立 D1 数据库 `roamnote-travel` 后，把 Cloudflare 返回的数据库 ID 写入 `wrangler.jsonc` 的 `d1_databases` 中，绑定名称固定为 `DB`。执行 `npm run db:generate` 生成迁移，再使用 Wrangler 将迁移应用到远程数据库。

高德 Web 服务 Key 和安全密钥只能作为 GitHub / Cloudflare Secret 保存，不能写进仓库或浏览器代码。
