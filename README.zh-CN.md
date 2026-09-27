## 🧩 lexical-chunks 学习单元生成

`lexical-chunks` 使用固定版本的 spaCy 生成依存树，再按规则配置生成英文学习单元。规则配置位于 [closure-rules.json](./.agents/skills/lexical-chunks/rules/closure-rules.json)，规则标签和含义见[对照表](./docs/lexical-chunks-rule-labels.md)，工具接口见[工具说明](./docs/lexical-chunks-tooling.md)。

### 生成方式

- 脚本按依存树后序遍历处理节点；后序遍历顺序与槽位的查找方向相互独立。
- 单词规则根据 POS 生成独立单元；组合规则由锚点条件和槽位条件决定。
- 槽位沿 `head`、`child` 或两个方向查找目标节点。目标节点的 POS 和 dep 条件可以分别配置；未配置的条件不限制匹配。
- 每条组合规则最多配置一个必需槽位和一个可选槽位。必需槽位用于当前词对组合，可选槽位留给后续短语组合。
- 每个节点独立应用自己的规则，不读取其他节点已经生成的单元。相同 token 集合只输出一次，完整原句最后追加。

脚本只依据配置的 POS 和依存标签匹配组合，不使用词元条件。新增或调整规则时，同步更新闭合槽位配置和[标签对照表](./docs/lexical-chunks-rule-labels.md)。
