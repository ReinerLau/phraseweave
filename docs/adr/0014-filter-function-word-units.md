# 过滤单独练习的功能词词元

状态：已由 [ADR 0018](0018-retain-all-word-units.md) 取代。

依存组合仍先使用原句中的全部非标点词，以保留 `the USA`、`of light`、`could be` 等渐进短语；组合完成后，学习计划移除词性为 `DET`、`ADP`、`AUX` 的单词单元。这修订了 [ADR 0012](0012-adjacent-subtree-closure.md) 中每个词都成为练习单元的决定：这些孤立功能词往往难以给出自然、准确的中文提示，而包含它们的短语仍有学习价值。

若一个保留单元的任一直接来源已被过滤，PhraseWeave 的来源数组为空，复习模式也不重放该来源对；两个来源都保留时继续按 [ADR 0013](0013-error-driven-review-recovery.md) 回退。旧计划因算法版本更新而失效，PhraseWeave 导入 schema 不变。
