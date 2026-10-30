# 暂停新卡片的从句拆分

> 已由 [ADR 0040](0040-dependency-composition.md) 对新卡片的默认递归拆分取代。以下记录历史决定及旧卡片行为。

新生成的练习暂时只使用标点分段与非从句前置成分拆分。生成页移除从句拆分选项，生成器不再调用从句识别算法，也不再输出 `lazy-content-function-clause-v1`。显式传入旧 `splitClauses: true` 请求时返回错误，避免悄悄生成不同题序。前置状语从句也不再作为前置成分拆开；时间副词、名词性时间状语和介词短语仍按现有规则处理。

旧练习卡片的题序已保存，无需重新解析。从句模式生成的 schema 6、7、8 卡片继续按保存的 `practice_spans` 或 `practice_steps` 导入、练习、续练和翻译。本决定暂停 [ADR 0033](0033-optional-clause-practice.md)、[ADR 0034](0034-punctuation-segment-practice.md)、[ADR 0035](0035-content-function-practice.md) 中的新卡片从句生成选项，并收窄 [ADR 0036](0036-fronted-adjunct-practice.md) 的前置成分范围；这些 ADR 仍记录旧卡片格式及历史算法。
