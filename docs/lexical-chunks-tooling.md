# 本地学习单元生成器

生成器是 PhraseWeave 客户端中的独立路由，没有清单页入口。部署后直接打开：

```text
https://reinerlau.github.io/phraseweave/generator
```

英文输入、spaCy 依存分析和模型翻译都在运行本地服务的电脑上完成。Markdown 和 PhraseWeave JSON 在本地服务与页面内存中生成和预览，不写入项目目录。页面通过浏览器下载文件；离开页面或开始下一次生成后，页面内的结果会释放。

## 启动本地服务

在仓库根目录运行：

```bash
python3 tools/lexical_chunks/local_service.py
```

保持终端运行，在生成器页面点击“连接本地服务”。启动需要 `uv`。首次启动会创建隔离 Python 环境、安装锁定依赖，并在服务开始监听前下载 Helsinki 模型。后续启动会复用缓存的环境和模型。依赖和模型保存在用户缓存目录，不写入仓库。若初始化失败，服务会退出并在终端显示错误。首次浏览器连接可能询问是否允许页面访问本机服务。

## 翻译

- 模型固定为 `Helsinki-NLP/opus-mt-en-zh` revision `408d9bc410a388e1d9aef112a2daba955b945255`，输出语言前缀为 `>>cmn_Hans<<`。
- 使用 Transformers/PyTorch 在本机运行固定版本的 Helsinki 模型。翻译只保留这一条路径，不再进行 CTranslate2 转换。
- 模型输入上限为 512 个 tokenizer token；超长句会显示错误，不会截断翻译或导出部分文件。
- 每个完整原句生成一条中文提示。同句所有学习单元共用该提示。

## 学习单元与导出

分句、双引号处理和依存树闭合算法沿用 [ADR 0012](adr/0012-adjacent-subtree-closure.md)、[ADR 0015](adr/0015-ignore-double-quotes-in-learning-units.md) 和 [ADR 0018](adr/0018-retain-all-word-units.md)。`standard` 和 `review` 模式以及 `markdown`、`phraseweave`、`both` 导出格式保持原行为。PhraseWeave JSON 使用 schema 4，含稳定 `unit_id`、直接来源 `source_unit_ids` 及原句上下文。

下载文件名包含 UTC 时间戳，重复生成时也能得到不同文件名。生成器服务仅绑定 `127.0.0.1:8765`，并校验客户端来源后接受生成请求；页面确认接收任务结果后，服务会释放对应的内存内容。若页面在任务完成前关闭，未领取的结果会在下次任务启动时清理。
