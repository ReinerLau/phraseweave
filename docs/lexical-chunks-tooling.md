# lexical-chunks 工具接口

`lexical-chunks` 使用固定 spaCy 模型构造依存树，并由人工维护的 JSON 规则生成渐进学习单元。执行器严格按依存树后序遍历节点；每条槽位单独配置从来源节点沿 `head`、`child` 或两者查找。遍历顺序与查找方向相互独立，规则不能读取其他节点已生成的单元。

## 数据流

```mermaid
flowchart LR
    A[英文教材] --> B[固定 spaCy 依存分析]
    B --> C[依存树后序遍历]
    C --> D[按槽位方向匹配依存关系]
    D --> E[单元去重并追加完整原句]
    E --> F[计划 schema 2 + segments]
    F --> G[中文提示]
    G --> H[按规则摘要重新生成并校验]
    H --> I[Markdown 或 PhraseWeave JSON]
```

后序遍历先访问节点的所有子节点，再处理该节点。处理节点时，单词规则和组合规则都只以该节点为锚点；每个槽位按配置沿 head、child 或两者查找。当前词对阶段只使用必需槽位，可选槽位留待后续短语组合。相同 token 集合只输出一次；完整原句最后追加。

规则文件 `rules/closure-rules.json` 使用 schema 8，包含 `singleton_rules`、`unit_rules` 和每个锚点的候选上限。每个组合槽位包含来源节点、方向、目标节点的可选 POS/dep 条件和 `required` 标记。当前词对阶段只匹配必需槽位，可选槽位保留给后续短语组合；必需槽位可以为空，此时锚点本身成为单元。每条规则最多包含一个必需槽位和一个可选槽位。单词规则按优先级选择，组合规则可独立命中。

例如，当前规则中 `Tulane` 经必需的 `compound` 槽位向上到 `University`，生成词对 `Tulane University`。`the` 经必需的 `det` 槽位到 `USA`，生成 `the USA`。`with` 锚点沿 `child` 方向匹配目标 `light`，生成 `with light`；同一条规则也允许 `on` 沿 `head` 方向匹配 `light`，生成 `light on`。宾语的限定词 `a` 位于可选槽位，留待未来短语组合。

## 命令行

- `--plan-output <路径>`：从标准输入读取英文并生成计划。
- `--render-plan <路径>`：校验计划并根据标准输入中的中文提示渲染。
- `--rules <路径>`：指定规则文件，默认使用 skill 内置 JSON 规则。
- `--trace-output <路径>`：单独输出每个单元的规则标签表；Markdown 学习单元表已包含相同标签。
- `--format markdown|phraseweave|both`：选择最终格式，默认 `markdown`。
- `--output <路径>`：Markdown 路径；`phraseweave` 模式下为 JSON 路径。
- `--phraseweave-output <路径>`：在 `both` 模式下单独指定 JSON 路径。

计划生成与渲染必须使用相同规则文件。输出路径已存在时使用递增编号。

## 英文计划 schema 2

计划包含规则版本和文件摘要，渲染器据此验证重新生成的结果使用了同一规则。每个单元包含 `text`、`kind` 和 `segments`。每个来源段是相对句子的左闭右开字符区间；非连续来源按原文顺序用一个空格拼接。

```json
{
  "schema_version": 2,
  "rules_version": 8,
  "rules_sha256": "<规则文件摘要>",
  "sentences": [
    {
      "sentence": "Researchers from Tulane University.",
      "units": [
        {"text": "Tulane University", "segments": [{"start": 17, "end": 34}], "kind": "composition"},
        {"text": "Researchers from Tulane University.", "segments": [{"start": 0, "end": 35}], "kind": "sentence"}
      ]
    }
  ]
}
```

`kind` 为 `base`、`composition` 或 `sentence`。中文提示 JSON 继续使用 schema 1，`unit_prompts` 按每句 `units` 顺序逐项对齐。PhraseWeave 导入数据继续使用 schema 1。

Markdown 学习单元表列为序号、中文提示、英文答案和规则标签。同一单元由多条规则生成时，标签全部列出。

## 固定依赖与边界

| 依赖 | 版本 | 用途 |
|---|---:|---|
| spaCy | `3.8.7` | 分句、词性、形态、依存关系和字符位置 |
| en_core_web_sm | `3.8.0` | 固定英语分析 |
| click | 脚本元数据解析的兼容版本 | 支持隔离运行时加载 spaCy 模型 |

每个锚点默认最多生成 4096 个候选，超出时报错，不截断。相同文本、依赖版本和规则文件产生相同计划；中文措辞由模型生成。详细领域决策见 [ADR 0009](adr/0009-postorder-head-only-paths.md)。
