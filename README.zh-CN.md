## 🧩 lexical-chunks 学习单元生成

`lexical-chunks` 使用固定 spaCy 模型分句并生成依存树，再按原文邻接关系逐层组合英文学习单元。生成器先输出每个非标点词，随后把已经完成的子短语从近到远接到中心词；同层左右分支先分别输出，再合并并继续向外扩展。模型为每个完整原句提供一条中文提示，学习者在英文原句中填入当前单元。

英文计划使用 schema 3；Markdown 显示整句中文提示、英文挖空、依存树和组合说明，PhraseWeave JSON 使用 schema 4。运行方式、标点处理及计划结构见[工具接口](docs/lexical-chunks-tooling.md)，策略取舍见 [ADR 0012](docs/adr/0012-adjacent-subtree-closure.md)。
