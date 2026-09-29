# 地点图片维护

图片存入私有 R2 bucket `roamnote-images`，D1 保存地点名称、GCJ-02 坐标、别名、来源、作者、许可和图片对象路径。网站仅通过 `/media/<图片ID>` 提供已审核的展示图，不提供任意对象路径访问。

## 导入首批图片

`data/place-images.sources.json` 是人工选择的来源清单，覆盖上海、北京、杭州、苏州、厦门、成都、阿尔山的首批地点。来源页面均已核对作者与图片许可。

```sh
npm run images:prepare
npm run images:import -- --local
```

准备脚本下载来源、保存原图、自动旋转、去 EXIF、缩放到 1200px 宽并生成 WebP。结果保存在 Git 忽略的 `.place-images/`，包含原图、压缩图和 manifest。保存完整原图构图，在卡片里按 `focalX`/`focalY` 裁切。代码仓库只保存清单，避免大图片进入 Git。

本地导入仅操作 Miniflare 的本地 D1/R2。准备好后可使用现有 Wrangler 登录上传正式图片：

```sh
npm run images:import -- --remote
```

导入脚本先验证所有文件哈希与元数据，再执行迁移，把原始 JPEG 和展示 WebP 分别上传到私有 R2，最后更新图库索引。原图保存在 R2 的 `originals/` 前缀下，网站接口不会提供这些私有原图。重复导入按图片 ID 更新记录，不修改行程和账户。新图以内容哈希命名，避免浏览器沿用旧图。

如果本机无法访问 Wikimedia，可进入 GitHub Actions 的 `Deploy Roamnote to Cloudflare Workers`，选择 `Run workflow` 并勾选 `import_images`。该任务会准备、上传图片并发布网站；普通 push 发布不会重新下载图片。GitHub 仓库只存来源清单和导入代码，不存图片二进制；流程不再生成图片 artifact。2026-09-29 早先的一次运行曾生成 30 天临时 artifact，过期后会自动消失。

若导入任务提示 R2 权限不足，需要给已有 `CLOUDFLARE_API_TOKEN` 增加当前账号的 `Workers R2 Storage: Edit` 权限并更新 GitHub Secret。服务端运行通过 bucket binding 读取，不需要 S3 Access Key。

## 添加地点

向来源清单添加同结构记录，然后重新准备和导入。`names` 使用明确的别名，不自动去掉“分店”“东馆”等区分地点的词。坐标必须是 GCJ-02，与高德一致；不能直接复制照片 EXIF 的 WGS-84 坐标。

`matchRadius` 控制同名匹配距离。普通地点建议 200–1500 米；博物馆东馆暂用 3000 米兼容现有演示行程的近似坐标。卡片只有在名称/别名和距离都满足条件时才显示图片。

清单里的 `licenseUrl` 必须与脚本内的许可白名单一致。图片是 CC BY-SA 时，压缩图继续使用原许可，卡片提供作者、来源与许可链接，并在图片提示中说明缩放和裁切。

## 下架图片

将 D1 `place_images` 表中对应记录的 `approved` 改为 `0` 即停止新的匹配和读取。已缓存图片最长可能保留 1 小时。原始 bucket 对象保持私有。

## 迁移存储

行程快照不保存供应商 URL。图片索引保存稳定 ID 和 `object_key`，未来复制对象到 OSS 后只需调整 `/media/<图片ID>` 的读取实现；增加独立图片域名也可以在这个接口统一处理。

## 当前范围

实现的是自建图库查询与导入。长尾地点显示“地点实景待补充”，不会使用无关城市图。尚未接高德实时照片或用户上传功能。
