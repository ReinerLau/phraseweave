# 学习单元规则标签对照

规则表每条规则占一行。锚点条件决定当前节点是否触发规则，槽位条件描述要沿依存关系找到什么节点。单词单元规则可以只列 POS；组合规则按需列 POS 和 dep。

槽位字段顺序固定为 `POS；dep；方向`。POS 和 dep 条件可以分别配置；未配置的条件记为 `—`，不参与匹配。配置了两个条件时，目标节点必须同时满足两者。方向决定从来源节点向上或向下查找；可以配置一个方向，也可以同时配置多个方向。槽位条件始终匹配找到的目标节点。

每条规则最多有一个必需槽位和一个可选槽位。必需槽位参与当前词对组合；可选槽位为后续短语组合保留条件。单词单元规则独立生成单词单元；组合规则的必需槽位只约束该组合，不影响锚点单独成单元。

| 标签 | 锚点条件 | 必需槽位 | 可选槽位 |
| --- | --- | --- | --- |
| `S1` | POS=NOUN/PROPN/PRON/NUM | — | — |
| `S2` | POS=VERB | — | — |
| `S3` | POS=ADJ/ADV | — | — |
| `U1` | POS=NOUN/PROPN/ADJ/NUM；dep=compound/amod/nummod | POS=NOUN/PROPN/ADJ/NUM；dep=—；方向=head | POS=ADP；dep=prep；方向=head |
| `U2` | POS=NOUN/PROPN/PRON/NUM；dep=pobj/pcomp | — | POS=ADP；dep=prep；方向=head |
| `U3` | POS=DET；dep=det | POS=NOUN/PROPN/PRON/NUM；dep=—；方向=head | POS=ADP；dep=prep；方向=head |
| `U4` | POS=PRON/DET/NOUN/PROPN；dep=poss | POS=NOUN/PROPN/PRON；dep=—；方向=head | POS=ADP；dep=prep；方向=head |
| `U5` | POS=AUX；dep=aux | POS=AUX/VERB；dep=—；方向=head | — |
| `U6` | POS=ADJ/NOUN；dep=acomp | POS=AUX/VERB；dep=—；方向=head | — |
| `U7` | POS=ADP；dep=prep | POS=NOUN/PROPN/PRON/NUM/VERB；dep=pobj/pcomp；方向=head/child | POS=DET；dep=det；方向=child |

可选槽位目前只保存未来短语组合所需的匹配条件，不参与当前词对单元生成。相同 token 集合只显示一次；锚点单元若已由单词规则生成，空必需槽位的规则会复用该单元，不重复添加规则标签。

修改规则或依存槽位时，也要同步更新本表及[生成脚本中的 `RULE_TAGS`](../.agents/skills/lexical-chunks/scripts/split_lexical_chunks.py)。
