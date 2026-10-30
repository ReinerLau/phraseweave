# 依存关系递归组合题序

新卡片使用固定 spaCy 模型解析完整原句。在标点分隔片段内，以谓语为中心递归拆出可靠的主语、宾语、补语、前后状语及从句内部的同类成分。介词宾语先于完整介词短语练。每个成分单独练后立即按原文顺序接回当前核心；无法可靠定位时保留上层片段。名词短语中的冠词、形容词仍由词题覆盖，不逐词生成句法组合。

组合片段可以由多个不相邻的原文范围组成，例如 `She quietly finished` 依次练 `She`、`finished`、`She finished`、`quietly`、`She quietly finished`。跨位置题保存原文范围与实际文本；缩写不能在可输入词元内部切开。首次题序完成后仍只复习整句。

新导出使用 schema 9，继续使用 `lazy-content-function-v1` 题序标识。连续题仍保存 `span`；跨位置的片段题另外保存 `source_spans` 与 `text`，`span` 为两端的包围范围。翻译、输入与朗读使用 `text`，整句题仍使用完整原文。schema 4–8 卡片按已有题序继续练习，不重新解析。旧 `splitClauses` 选项仍不可用；新默认题序直接递归进入可可靠定位的从句。

本决定取代 [ADR 0037](0037-pause-clause-splitting.md) 对新卡片暂停从句拆分的规定，并扩展 [ADR 0039](0039-core-first-practice-order.md) 的核心优先题序。历史卡片规则不变。
