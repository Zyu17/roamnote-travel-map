# 漫游记 Cloudflare Workers 发布准备

本项目通过 GitHub Actions 发布到 Cloudflare Workers。每次推送 `main` 都会构建并发布。

## 一次性配置

1. 在 Cloudflare 创建 Worker，名称为 `roamnote-travel-map`。
2. 在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 添加：
   - `CLOUDFLARE_API_TOKEN`：授予该账号的 Workers 编辑和 D1 编辑权限，以便发布和运行数据库迁移。
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账号 ID。
   - `AMAP_JS_KEY`、`AMAP_SECURITY_CODE`、`AMAP_WEB_SERVICE_KEY`：高德的三项配置。
   - `REGISTRATION_CODE`：邀请注册使用的注册码，支持 4–256 个字符，区分大小写，忽略首尾空白。建议使用至少 6–8 位随机字母数字组合；4 位短码比较容易被猜中。放入 GitHub Actions Secret，绝不要写入仓库。你可私下把同一注册码交给受邀用户；缺少、短于 4 位或长于 256 位时，发布检查会失败。每个网络地址 15 分钟最多提交 5 次邀请码（正确和错误都计入），更换邮箱不能绕过该限制。若注册码外泄，请在 GitHub Actions Secret 中换新并重新发布。
3. 推送 `main`，Actions 会发布到 `https://roamnote-travel-map.<你的子域>.workers.dev`。

仅修改 GitHub Secret 不会自动更新 Cloudflare。换邀请码后，到 `Actions → Deploy Roamnote to Cloudflare Workers → Run workflow`，选择 `main` 并运行；成功后新邀请码才会在线上生效。

## D1 数据库

项目已经绑定独立 D1 数据库 `roamnote-travel-db`，绑定名称为 `DB`。GitHub Actions 在发布 Worker 前自动运行远程迁移。邮箱账户表、密码校验值、会话表和登录限流表包含在 `drizzle/0001_public_captain_stacy.sql` 中。注册密码至少 8 位，最多 256 字节；浏览器进行 60 万次 PBKDF2 推导，服务端只保存经独立随机盐二次哈希的校验值，不保存明文密码或可直接重放的浏览器凭据。已有账户的密码与加密格式不变，仍可正常登录。

首次用邮箱登录时，应用会尝试将当前浏览器原先以设备标识保存的行程认领到账户。其他旧浏览器上的行程需要分别在原浏览器登录同一个账户，才能汇总到账户下。不要在完成迁移前清除原浏览器的网站数据。

分享链接现在是只读能力链接；只有登录的行程所有者可以更新、删除和从行程库查看其所有行程。邮箱暂不验证，也没有密码找回流程。每个受邀者使用自己的邮箱和密码注册，行程按账户隔离。注册码只发给信任的人，不要公开或提交到 Git；因为不验证邮箱，持有注册码的人仍可能抢注别人的邮箱。

密码推导在浏览器中运行，避免占用 Workers 免费套餐每次请求的 10 毫秒 CPU 配额。正式发布后仍需实际注册、退出、重新登录并跨浏览器检查同步；若线上出现资源限制错误，应暂停开放使用并排查，不要直接降低哈希强度。

高德 Web 服务 Key 和安全密钥只能作为 GitHub / Cloudflare Secret 保存，不能写进仓库或浏览器代码。
