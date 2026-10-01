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

安装 PKG 后，在 Chrome 中加载 `apps/browser-extension`。选中网页英文时，右键菜单可分别导入网页版或桌面版；桌面版未运行时会自动打开。网页版导入仍须单独启动本地服务。桌面版导入失败时，扩展会显示错误通知，不会把练习转存到另一端。

桌面版通过现有信令 Worker 同步练习到手机；二维码指向 GitHub Pages 的接收页。这一步需要网络，离线练习不需要。
