# 默认标点片段内拆分前置状语

默认生成模式在现有标点分段之后，使用固定版本 spaCy 在每个标点片段内寻找完整的前置状语与后面的主谓核心。当前识别完整位于主语前、附着于该片段主句谓语的副词、名词性时间状语、介词短语和状语从句；片首连接词随前置成分保留，多个连续前置成分合为一段。不按词数设置门槛。前缀只有连接词、包含未闭合成分或主句边界不可靠时保留原标点片段。

拆分出的连续小片段按原文顺序先练，随后复现原标点片段，最后仍复现完整原句。例如 `and soon enough another month had passed.` 依次得到 `and soon enough`、`another month had passed.`、原片段。最小片段沿用 [ADR 0035](0035-content-function-practice.md) 的实义词与功能词题；较大片段只练完整复现。生成预览与导出保存同一题序，继续使用 schema 8 和 `lazy-content-function-v1`，因每张卡片已保存完整 `practice_steps`，旧卡片不重算。

可选从句模式仍仅使用 [ADR 0033](0033-optional-clause-practice.md) 的从句算法，两个模式都先按 [ADR 0034](0034-punctuation-segment-practice.md) 划分标点片段。本决定补充 ADR 0034、0035 对默认模式最小片段的约定，不改变旧语块算法。所有当前与保留备用的拆分条件、例外及可核对示例见[练习拆分规则索引](../practice-splitting-rules.md)。
