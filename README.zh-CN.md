## 🧩 lexical-chunks 学习单元生成

`lexical-chunks` 使用固定 spaCy 模型分句并生成依存树，再按原文邻接关系逐层组合英文学习单元。生成器先输出每个非标点词，随后把已经完成的子短语从近到远接到中心词；同层左右分支先分别输出，再合并并继续向外扩展。模型只填写中文提示。

英文计划使用 schema 3；Markdown 显示依存树和组合说明，PhraseWeave JSON 使用 schema 3，并保留旧格式的导入支持。运行方式、标点处理及计划结构见[工具接口](docs/lexical-chunks-tooling.md)，策略取舍见 [ADR 0012](docs/adr/0012-adjacent-subtree-closure.md)。
