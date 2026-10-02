# 本地 npm 包与 macOS 桌面版

PhraseWeave 的本地页面和生成引擎由 GitHub Packages 上的 `@reinerlau/phraseweave` 提供。首版支持 Apple Silicon macOS。终端运行 `phraseweave` 会在本机启动页面，桌面应用则在启动时检查并安装最新 npm 包，然后在窗口内打开同一页面。练习、练习目录和学习进度保存在 `~/Library/Application Support/PhraseWeave/phraseweave.sqlite3`，由 npm 页面与桌面应用共用；两种浏览器配置中的显示偏好仍各自保存。

首次使用共享存储时，应用会把当前浏览器配置中的旧 IndexedDB 练习和进度导入本机数据库。桌面端会保持本地页面端口，以便升级后继续读取原配置中的旧数据。数据库仅保存在本机，不会自动同步到其他设备。

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

打开终端输出的 `http://127.0.0.1:端口/` 地址。默认端口是 3000；若被占用，命令会输出实际使用的端口。服务只监听本机，按 Ctrl-C 结束。首次启动自动准备 Python 3.13、锁定的依赖和约 4 GB 的 Hy-MT2 模型，页面会显示生成引擎的准备状态。

已安装新版桌面启动器的用户可直接点击图标。启动器会等待 npm 包更新完成，再打开窗口；离线或更新失败时使用已安装的版本。如果包尚未安装且无法访问 GitHub Packages，窗口会显示错误和登录指引。终端与桌面同时运行时各自启动服务，互不依赖。

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

Chrome 扩展的桌面导入仍通过 Native Messaging 唤起桌面应用；GitHub Pages 生成器仍可访问运行中的本地 `127.0.0.1:8765` 服务。如果该端口已被另一实例占用，后一实例使用私有端口，但其自身页面和桌面窗口仍可正常生成。
