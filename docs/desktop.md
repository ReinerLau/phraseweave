# macOS 桌面版

桌面版和 GitHub Pages 版都从 `apps/client` 构建，使用相同的练习清单、生成器及练习页面。桌面版将页面和 Python 生成引擎一同安装；首次启动时下载 Helsinki 翻译模型。模型下载后，桌面生成和练习可以离线使用。网页练习与桌面练习分别保存在各自的浏览器数据目录中。

## 本机构建

首版面向 Apple Silicon Mac。在仓库根目录执行：

```bash
pnpm install
pnpm desktop:make:mac
```

构建会生成 Nuxt 静态页面、冻结锁定版本的 Python 运行环境、编译 Chrome Native Messaging 宿主，最后产出安装到 `/Applications/PhraseWeave.app` 的 PKG。构建需要 `uv`、Swift 编译器和 macOS 的打包工具。桌面开发模式可运行 `pnpm desktop:dev`，它使用当前电脑的 `python3` 与 `uv`，不生成安装包。

本机构建的 PKG 尚未签名或公证；对外分发前需要配置 Apple Developer 签名和公证。

## 自动构建与发布

每次 PR 合并到 `main`，GitHub Actions 都会从合并提交分别构建并部署 GitHub Pages、构建 Apple Silicon 桌面安装包。安装包作为该次 Actions 运行的产物保留 7 天；桌面构建失败不会阻止 Pages 部署。

正式发布时，在已合并到 `main` 的提交上创建并推送 `vMAJOR.MINOR.PATCH` 标签。桌面工作流会用标签版本号构建 PKG，并把 PKG 和浏览器扩展 ZIP 发布到同名 GitHub Release。例如：

```bash
git tag v1.0.1
git push origin v1.0.1
```

发布新版后，已经安装的桌面应用不会自动更新，用户需要下载安装新版 PKG。

安装 PKG 后，在 Chrome 中加载 `apps/browser-extension`。选中网页英文时，右键菜单可分别导入网页版或桌面版；桌面版未运行时会自动打开。桌面应用运行时也会在 `127.0.0.1:8765` 提供生成服务，GitHub Pages 的生成器页面可以直接使用；浏览器首次连接可能询问是否允许访问本机服务。关闭桌面应用后，这个服务也会停止。若 `8765` 已被独立启动的本地服务占用，网页版继续使用已有服务，桌面应用会改用自己的随机端口；之后若关闭独立服务，需要重启桌面应用才能让它接管 `8765`。桌面版导入失败时，扩展会显示错误通知，不会把练习转存到另一端。

桌面版通过现有信令 Worker 同步练习到手机；二维码指向 GitHub Pages 的接收页。这一步需要网络，离线练习不需要。
