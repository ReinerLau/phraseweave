# 本地 npm 包与 macOS 桌面版

PhraseWeave 的本地页面和生成引擎由 GitHub Packages 上的 `@reinerlau/phraseweave` 提供。首版支持 Apple Silicon macOS。终端 CLI 与桌面启动器连接同一个本机服务、页面端口和生成引擎。练习、练习目录和学习进度保存在 `~/Library/Application Support/PhraseWeave/phraseweave.sqlite3`，电脑与手机共用。

首次使用共享存储时，应用会把当前浏览器配置中的旧 IndexedDB 练习和进度导入本机数据库。本机页面端口会尽量沿用上次端口；若被其他程序占用，则选择空闲端口。GitHub Pages 浏览器数据不迁移。

## 首次安装

先安装 Node.js（版本至少为 20.12.2）。GitHub Packages 安装公开 npm 包也需要凭据：创建具有 `read:packages` 权限的 GitHub classic personal access token，并执行一次：

```sh
npm login --scope=@reinerlau --auth-type=legacy --registry=https://npm.pkg.github.com
```

按提示输入 GitHub 用户名，并以 token 作为密码。凭据保存在当前用户的 npm 配置中；桌面应用使用同一用户的 npm 登录状态，不会接收或保存 token。

可直接从终端安装并启动：

```sh
npm install -g @reinerlau/phraseweave
phraseweave
```

打开终端输出的 `http://127.0.0.1:端口/` 地址。默认端口是 3000；若被占用，命令会输出实际使用的端口。服务只监听本机，按 Ctrl-C 关闭这个终端入口；最后一个本地入口关闭后，共享服务停止。首次启动自动准备 Python 3.13、锁定的依赖和约 4 GB 的 Hy-MT2 模型，页面会显示生成引擎的准备状态。

已安装新版桌面启动器的用户可直接点击图标。启动器会等待 npm 包更新完成，再打开窗口；离线或更新失败时使用已安装的版本。如果包尚未安装且无法访问 GitHub Packages，窗口会显示错误和登录指引。若已有服务运行，启动器直接使用该版本与页面；更新在服务完全停止后下次启动时生效。

旧桌面版需要重新安装一次新版启动器。旧版桌面的练习和进度不会迁移到新页面来源。

## 本机构建

在仓库根目录执行：

```sh
pnpm install
pnpm cli:build
pnpm cli:test
pnpm desktop:make:mac
```

`pnpm cli:build` 生成 GitHub Packages 的 npm 内容，需要 Apple Silicon Mac、`uv 0.11.2` 和 Node.js。`pnpm desktop:make:mac` 只编译图标、Chrome Native Messaging 宿主和轻量 Electron 启动器，不再构建页面或冻结 Python。桌面开发模式为 `pnpm desktop:dev`，使用当前工作树构建的 npm 包内容。

本机构建的 PKG 尚未签名或公证；对外分发前仍需配置 Apple Developer 签名和公证。

## 发布

每个 PR 合并到受保护的 `main` 后，现有流程递增 patch 版本并创建标签。标签工作流从该提交构建 `@reinerlau/phraseweave`，用仓库 `GITHUB_TOKEN` 发布到 GitHub Packages，同时创建 GitHub Release 并附上浏览器扩展 ZIP。首次发布后，在 GitHub Packages 设置中将包改为公开。包只发布到 GitHub Packages，不发布到 npmjs.org。

只有启动器本身需要更新时，才手动运行 **Build macOS desktop launcher** 工作流并输入已有的 `vMAJOR.MINOR.PATCH` 标签；它从该标签构建 PKG，附加到对应 GitHub Release。普通页面与生成器更新只需发布 npm 包，已安装的新启动器下次打开时会自动安装。

## Chrome 扩展

安装 npm CLI 后执行 `phraseweave extension install`，在当前用户的 Chrome 配置目录注册 Native Messaging 宿主，无需安装桌面启动器或管理员权限。随后在 `chrome://extensions` 加载或重新加载扩展。迁移 npm 安装目录或更换 Node 可执行文件后，重新执行安装命令更新路径。

先在终端运行 `phraseweave` 并保持运行，再选择英文文本，右键点击「导入 PhraseWeave」。扩展读取正在运行的服务实际端口，在新的 Chrome 标签页打开 Web UI，自动生成 Markdown 和 PhraseWeave JSON。先查看 Markdown 预览，确认后点击「保存并进入练习」才写入共享练习库并打开练习。预览只保留在页面中，刷新后需要重新导入。

扩展不会启动桌面应用或自动启动服务；服务未运行时会提示先执行 `phraseweave`。旧桌面安装包注册的宿主不再用于新版扩展，不需要重新安装桌面启动器。

## 手机访问整个应用

准备一个可以修改 DNS 服务器的域名，将其接入 Cloudflare。手机访问的固定地址可设为 `https://phraseweave.example.com`；Mac 必须开机、联网并保持唤醒。访问时，Cloudflare 会先要求登录，生成器、练习清单和练习页面均受保护。

1. 在 Mac 安装 `cloudflared`。执行 `cloudflared tunnel login`，再用 `cloudflared tunnel create phraseweave` 创建本地管理的 Tunnel，记下输出的 UUID 和凭据文件路径。用 `cloudflared tunnel route dns phraseweave phraseweave.example.com` 创建 DNS 记录。
2. 在 Cloudflare Zero Trust 中为 `phraseweave.example.com` 创建 Self-hosted Access 应用，覆盖整个域名；启用 One-time PIN，只在 Allow 策略中列出自己的**具体邮箱地址**。从应用设置中记录 Access AUD 标签，以及 Zero Trust 团队名称。建议把应用会话设为 30 天。
3. 执行以下命令，替换占位值：

   ```sh
   phraseweave remote configure \
     --origin https://phraseweave.example.com \
     --tunnel-id TUNNEL_UUID \
     --credentials-file /绝对路径/TUNNEL_UUID.json \
     --team-name TEAM_NAME \
     --aud-tag ACCESS_AUD_TAG
   ```

4. 重新启动 `phraseweave` 或桌面启动器。CLI 会根据实际页面端口运行 `cloudflared`，无需固定本机端口。手机用浏览器打开固定地址并输入邮件验证码。可用 `phraseweave remote status` 查看已配置的地址，Tunnel 错误记录在 `~/Library/Application Support/PhraseWeave/cloudflared.log`。

`phraseweave remote disable` 会删除远程配置，重启后生效。配置和 Tunnel 凭据只保存在本机，不提交到仓库。请确保域名的 Access 应用覆盖所有路径；CLI 会让 `cloudflared` 在转发前验证 Access JWT。当前正在运行的旧版 CLI 不支持共享控制 socket，升级后先关闭旧实例再启动新版本。
