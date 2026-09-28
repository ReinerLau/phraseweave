# lexical-chunks 工具接口

`lexical-chunks` 在分句和依存分析前去掉直双引号 `"` 与弯双引号 `“”`；单引号及单词内撇号保留。随后使用固定 spaCy 模型分句并构造依存树。执行器后序处理每个非标点词：同一中心词下先处理有非标点子节点的分支，再处理叶节点，各组保持原文顺序；随后生成中心词单词单元，接入直接子节点已经闭合的完整短语。每轮只接入与当前片段左右紧邻的子短语；两侧同时可接入时，依次输出左侧、右侧、两侧合并，然后以两侧合并的片段继续向外扩展。组合后过滤词性为 `DET`、`ADP`、`AUX` 的单词单元；短语照常保留。依存标签只来自 spaCy 的解析结果。

## 组合边界

- 子短语必须包含该子节点之下的全部非标点词，且本身是去掉双引号后的连续文本片段。未闭合的子短语不能传给父节点。
- 邻接按去掉双引号后的 spaCy token 顺序判断；逗号、分号等句中标点阻断局部组合。无法闭合的分支会出现在 `--trace-output` 的说明中。
- 所有非标点词先参与组合。冠词、介词和助动词仍保留在较大的原文短语中，但其 `DET`、`ADP`、`AUX` 单词单元不进入计划；其他单词单元照常保留。并列结构严格按依存树处理，没有语法特例。
- 每句最后追加一次完整句子单元，保留其余句内标点，去掉句末标点；若已生成相同文本范围的短语，就将该范围作为整句移到最后。

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

计划记录算法和解析器版本。`sentence` 保存去掉双引号后用于依存分析的句子；每个单元的 `span` 是相对于该句的左闭右开字符范围，`text` 必须等于该范围的文本。`kind` 为 `word`、`phrase` 或 `sentence`。旧算法版本的计划需要重新生成。

```json
{
  "schema_version": 3,
  "algorithm_version": 4,
  "spacy_version": "3.8.7",
  "model_version": "3.8.0",
  "sentences": [
    {
      "sentence": "the USA.",
      "units": [
        {"text": "USA", "span": {"start": 4, "end": 7}, "kind": "word"},
        {"text": "the USA", "span": {"start": 0, "end": 7}, "kind": "sentence"}
      ]
    }
  ]
}
```

渲染器按当前版本重新生成英文单元并逐项校验，再验证中文提示 JSON schema 1 中每句 `unit_prompts` 的数量。Markdown 包含依存树、中文提示、英文答案与组合说明。

PhraseWeave 导入 JSON 使用 schema 3 的平铺 `statements`。每行保留 `chinese`、`english`、`soundmark`，增加稳定的 `unit_id` 和 `source_unit_ids`。单词或没有可练来源的单元使用空数组；只有一个直接来源保留时使用单个 ID，两个都保留时按原文位置排列。`review` 模式复习仍保留的直接来源，重复行共用相同的单元 ID 与来源。客户端在答错可拆单元时使用这些关系逐级回退；旧 schema 1、2 导入仍可用，schema 1 没有回退关系。

依存组合与词元过滤的取舍分别记于 [ADR 0012](adr/0012-adjacent-subtree-closure.md)、[ADR 0014](adr/0014-filter-function-word-units.md) 和 [ADR 0016](adr/0016-retain-available-review-sources.md)。
