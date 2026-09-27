# lexical-chunks 工具接口

`lexical-chunks` 使用固定 spaCy 模型分句并构造依存树。执行器后序处理每个非标点词：先输出单词，再让中心词接入直接子节点已经闭合的完整短语。每轮只接入与当前片段左右紧邻的子短语；两侧同时可接入时，依次输出左侧、右侧、两侧合并，然后以两侧合并的片段继续向外扩展。无需 POS/dep 词对规则表，依存标签只来自 spaCy 的解析结果。

## 组合边界

- 子短语必须包含该子节点之下的全部非标点词，且本身是连续原文片段。未闭合的子短语不能传给父节点。
- 邻接按 spaCy token 的原文顺序判断；逗号、分号等句中标点阻断局部组合。无法闭合的分支会出现在 `--trace-output` 的说明中。
- 所有非标点词都先成为单词单元，包括冠词、介词、助动词和连词。并列结构严格按依存树处理，没有语法特例。
- 每句最后追加一次完整句子单元，保留句内标点，去掉句末标点；若已生成相同原文范围的短语，就将该范围作为整句移到最后。

例如，`The young teacher gave her students a difficult problem after class.` 中，`problem` 先接相邻的 `difficult` 与闭合的 `after class`，再接较远的 `a`。因此生成 `difficult problem`、`problem after class`、`difficult problem after class`、`a difficult problem after class`，不生成 `a difficult problem`。

## 命令行

- `--plan-output <路径>`：从标准输入读取带原文标点的英文，生成计划。
- `--render-plan <路径>`：校验计划，根据标准输入中的中文提示渲染。
- `--format markdown|phraseweave|both`：最终格式，默认 `markdown`。
- `--output <路径>`：Markdown 路径；`phraseweave` 模式下为 JSON 路径。
- `--phraseweave-output <路径>`：`both` 模式下的 JSON 路径。
- `--trace-output <路径>`：另存组合说明和未闭合分支。

输出路径已存在时使用递增编号。计划生成与渲染都要求 spaCy 3.8.7 和 `en_core_web_sm` 3.8.0。

## 英文计划 schema 3

计划记录算法和解析器版本。`sentence` 保存用于依存分析的原句；每个单元的 `span` 是相对于原句的左闭右开字符范围，`text` 必须等于该范围的原文。`kind` 为 `word`、`phrase` 或 `sentence`。旧计划需要重新生成。

```json
{
  "schema_version": 3,
  "algorithm_version": 1,
  "spacy_version": "3.8.7",
  "model_version": "3.8.0",
  "sentences": [
    {
      "sentence": "the USA.",
      "units": [
        {"text": "the", "span": {"start": 0, "end": 3}, "kind": "word"},
        {"text": "USA", "span": {"start": 4, "end": 7}, "kind": "word"},
        {"text": "the USA", "span": {"start": 0, "end": 7}, "kind": "sentence"}
      ]
    }
  ]
}
```

渲染器按当前版本重新生成英文单元并逐项校验，再验证中文提示 JSON schema 1 中每句 `unit_prompts` 的数量。PhraseWeave 导入 JSON 继续使用 schema 1 的平铺 `statements`，现有客户端可直接导入。Markdown 包含依存树、中文提示、英文答案与组合说明。

此策略的取舍记于 [ADR 0012](adr/0012-adjacent-subtree-closure.md)。
