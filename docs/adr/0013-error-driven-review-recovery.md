# 答错后按组成关系回退复习

> 后续调整：生成器的题序已统一为复习题序，不再提供 `standard` 和生成模式选择；答错回退规则保留。练习页面支持切换学习方向，见 [ADR 0022](0022-switchable-learning-direction.md)。当前行为见[生成器说明](../lexical-chunks-tooling.md)。

渐进学习单元可能在再次参与组合前已间隔许多题，固定重放整条分解路径又会拉长题序。因此 PhraseWeave 同时支持 `standard` 和 `review` 基础题序，只在可拆单元答错时临时练习两个直接来源；来源答错才继续回退，答对来源后重试原单元。临时路径不改变已保存的基础进度，手动跳题会结束路径。

为让客户端识别组成关系，`lexical-chunks` 的 PhraseWeave 导出从 schema 1 升为 schema 2，给重复复习行同一个稳定单元 ID 和来源 ID。旧 schema 1 仍可导入并沿用原有答错重试行为；这项决策更新 ADR 0012 中“PhraseWeave 导入格式保持不变”的约定。
