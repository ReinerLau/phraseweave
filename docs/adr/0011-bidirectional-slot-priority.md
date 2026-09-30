# 双向槽位优先合并两侧匹配

## 状态

已由 [ADR 0012](0012-adjacent-subtree-closure.md) 取代。此前修订 [ADR 0009](0009-postorder-head-only-paths.md) 的多方向匹配语义。

## 决策

声明 `head` 和 `child` 两个方向的必需槽位，先分别匹配两侧目标。两侧都命中时，按每组 head/child 目标生成一个包含锚点的学习单元，不再输出该锚点的单向组合；仅一侧命中时，逐个输出该侧组合。两侧组合只使用必需槽位，仍按原文位置排列选中的 token。

这样，在 `Researchers from Tulane University in the USA say …` 中，介词锚点生成 `University in USA`，避免单独输出 `University in`。`with light` 和 `light on` 等只有一侧命中的组合继续生成。独立规则仍可生成 `the USA`；可选槽位继续留给后续短语组合。
