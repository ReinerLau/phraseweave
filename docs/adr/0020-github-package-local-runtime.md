# 本地运行时发布到 GitHub Packages

> GitHub Pages 与独立实例部分已由 ADR-0021 取代；npm 包发布方式保留。

GitHub Pages 与本地应用继续从同一个客户端构建。本地页面和 Python 生成引擎一起发布为 GitHub Packages npm 包 `@reinerlau/phraseweave`，终端和轻量桌面启动器都启动该包；这样日常更新不必重新打包 Electron 和 Python。GitHub Packages 的 npm registry 要求公开包的安装者也提供读取凭据，因此用户需先用 GitHub classic token 登录一次 npm，桌面端随后复用 npm 登录状态。已运行的实例保留版本化资源快照，以免全局包更新中断页面或生成任务。
