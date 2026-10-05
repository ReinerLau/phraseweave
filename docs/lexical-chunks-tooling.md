# 渐进学习单元生成器

PhraseWeave 的 `/generator` 页面由本机 CLI 提供。输入文本、spaCy 分析和 Hy-MT2 翻译在 Mac 上处理。普通生成可下载 Markdown、PhraseWeave JSON，或点击“保存并进入练习”将结果写入共享练习库。

从终端运行 `phraseweave`，或打开桌面启动器，均连接同一份本机服务；两个入口同时使用时不会启动第二份模型。Web UI 地址固定为 `http://127.0.0.1:3000/`，端口被占用时启动报错，不再自动更换。完整安装与手机访问方式见 [本地应用与远程访问](desktop.md)。

Chrome 扩展直接携带选中文本打开固定的本机 Web UI，文本放在 URL 片段中，页面读取后立即清除，再调用本机 API 自动生成。先查看 Markdown 预览，确认后点击「保存并进入练习」才保存和跳转。使用时保持终端中的 `phraseweave` 运行；无需桌面应用、Native Messaging 宿主或额外的 CLI 注册步骤。扩展不再打开 GitHub Pages。

模型固定为 `tencent/Hy-MT2-1.8B` revision `9a341cd1b679d3efd23b46e847b01745a71ed792`，按聊天模板翻译整句。单句英文输入上限为 512 个 tokenizer token；过长时显示错误。每个完整原句生成一条共用的中文提示。生成题序统一使用复习规则：组合学习单元前重放其直接来源，不再提供常规模式或模式选择。Markdown 与 PhraseWeave JSON 使用同一条题序。PhraseWeave JSON 使用 schema 4，包含稳定的 `unit_id`、直接来源 `source_unit_ids` 和原句上下文。
