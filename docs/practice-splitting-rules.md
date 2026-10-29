# 练习拆分规则索引

这里记录**当前生成流程**和**保留备用的旧语块流程**。每行的箭头表示按顺序得到的原文片段；除“分句”外，末尾的完整原句也是一道练习题。默认模式和可选从句模式共用分句、标点分段及片段内题目规则；“前置成分”仅用于默认模式，“从句”仅用于勾选从句模式。每节开头的实现路径适用于该节每一条规则，表格最后一列逐条指向对应测试。示例以固定版本 spaCy 的实际输出为准。历史上已被取代的算法见各 ADR，不作为当前规则。

## 1. 分句（两种当前模式）

实现：[sentence_review.py](../tools/lexical_chunks/sentence_review.py) 的 `split_sentences`；测试：[test_sentence_review.py](../tools/lexical_chunks/test_sentence_review.py)。本阶段输出原句列表，尚不生成片段题。

| 规则 | 条件 | 输入 → 分句结果 | 测试 |
| --- | --- | --- | --- |
| S1 句末边界 | `.?!` 后是空白或文本结束时分句。 | `Birds sing. Cats sleep?` → `Birds sing.` / `Cats sleep?` | `test_rule_index_sentence_examples` |
| S2 连续符号与闭合引号 | 连续句末符号和紧随的闭合引号留在前句。 | `“Go now?!” She left?` → `“Go now?!”` / `She left?` | `test_rule_index_sentence_examples` |
| S3 空段落 | 空行也结束当前原句。 | `Birds sing\n\nCats sleep` → `Birds sing` / `Cats sleep` | `test_rule_index_sentence_examples` |
| S4 缩写不分句 | 已识别的头衔和缩写内部句点不结束原句。 | `Dr. Smith paid, e.g. for lunch. Ms. Lee smiled.` → `Dr. Smith paid, e.g. for lunch.` / `Ms. Lee smiled.` | `test_rule_index_sentence_examples` |
| S5 小数不分句 | 两侧是数字的句点不结束原句。 | `He paid 3.14 dollars. She left.` → `He paid 3.14 dollars.` / `She left.` | `test_rule_index_sentence_examples` |
| S6 无句末符号 | 非空尾文本仍作为一个原句。 | `Birds sing\nsoftly` → `Birds sing\nsoftly` | `test_keeps_unpunctuated_text_and_rejects_empty_input` |
| S7 无可练文字 | 全空输入或只有标点的原句报错，不生成题目。 | `Birds sing. ...` → 报错：第 2 句没有词元 | `test_keeps_unpunctuated_text_and_rejects_empty_input` |

## 2. 标点分段（两种当前模式）

实现：[sentence_review.py](../tools/lexical_chunks/sentence_review.py) 的 `punctuation_practice_spans`；测试：[test_sentence_review.py](../tools/lexical_chunks/test_sentence_review.py)。以下示例只列片段复现题，省略片段内的实义词与功能词题。

| 规则 | 条件 | 输入 → 片段题序 | 测试 |
| --- | --- | --- | --- |
| P1 分隔符 | 逗号、分号、冒号、长破折号 `—` 划出连续片段。 | `A, B; C: D—E.` → `A` / `B` / `C` / `D` / `E.` / 整句 | `test_new_punctuation_steps_preserve_internal_symbols` |
| P2 数字内部不拆 | 数字两侧的逗号和冒号保留在同一片段。 | `Bring 1,000 books at 12:30; leave.` → `Bring 1,000 books at 12:30` / `leave.` / 整句 | `test_rule_index_punctuation_examples` |
| P3 网址内部不拆 | URL 中的冒号、逗号、分号不作边界。 | `See https://example.com:8080/a,b; leave.` → `See https://example.com:8080/a,b` / `leave.` / 整句 | `test_rule_index_punctuation_examples` |
| P4 其他符号不拆 | 撇号、引号、括号、连字符、短破折号 `–`、斜杠不作边界；句末 `.?!` 已由分句阶段处理。 | `Don't split "well-known" 3/4 (quoted) – now.` → 整句 | `test_rule_index_punctuation_examples` |
| P5 无空题 | 相邻分隔符之间没有可练文字时跳过空段。 | `A; : — B.` → `A` / `B.` / 整句 | `test_new_punctuation_steps_preserve_internal_symbols` |
| P6 边缘分号冒号 | 分号或冒号两侧没有可练文字时不作边界。 | `A: B;` → `A` / `B;` / 整句 | `test_new_punctuation_steps_preserve_internal_symbols` |
| P7 无有效分段 | 不足两个可练片段时只练整句。 | `Birds sing.` → 整句 | `test_rule_index_punctuation_examples` |

## 3. 前置成分二次拆分（仅默认模式）

实现：[fronted_practice.py](../tools/lexical_chunks/fronted_practice.py) 的 `fronted_adjunct_practice_spans`；测试：[test_fronted_practice.py](../tools/lexical_chunks/test_fronted_practice.py)。在每个标点片段内寻找主谓核心；只有主语之前的文字完整由前置状语及可选连接词组成，才在主语前拆开。多个连续前置成分合成一段，不设词数门槛。小片段先练，原标点片段随后复现。

| 规则 | 条件 | 输入 → 片段题序 | 测试 |
| --- | --- | --- | --- |
| F1 时间状语 | 前置副词短语完整修饰主句谓语。 | `and soon enough another month had passed.` → `and soon enough` / `another month had passed.` / 整段 | `test_fronted_time_modifier_replays_its_punctuation_parent` |
| F2 地点或时间介词短语 | 前置介词短语完整位于主语之前。 | `In the morning she left.` → `In the morning` / `she left.` / 整句 | `test_fronted_place_time_and_condition_keep_the_core_clause_together` |
| F3 条件状语 | 前置状语从句完整位于主句主语之前。 | `If it rains we will stay.` → `If it rains` / `we will stay.` / 整句 | `test_fronted_place_time_and_condition_keep_the_core_clause_together` |
| F4 多个前置成分 | 连续的完整前置成分合为一个片段。 | `Yesterday in the morning we left.` → `Yesterday in the morning` / `we left.` / 整句 | `test_fronted_place_time_and_condition_keep_the_core_clause_together` |
| F5 只有连接词不拆 | 主语前只有 `and` 等连接词，没有前置状语。 | `And another month had passed.` → 整句 | `test_connective_only_and_mid_clause_modifiers_do_not_split` |
| F6 句中修饰语不拆 | 状语位于主语之后。 | `She quietly left.` → 整句 | `test_connective_only_and_mid_clause_modifiers_do_not_split` |
| F7 不可靠边界不拆 | 前缀含有无法归入完整前置成分的文字，或解析无法确认主句主语。 | `😀 And then she left.` → 整句 | `test_unreliable_prefix_remains_whole_and_utf16_offsets_are_preserved` |
| F8 不误认从句主语 | 前置从句自己的主语不是主句拆分点。 | `When the sun rose the birds sang.` → `When the sun rose` / `the birds sang.` / 整句 | `test_subordinate_subject_is_not_mistaken_for_the_core_subject` |

## 4. 可选从句拆分（仅勾选从句模式）

实现：[clause_practice.py](../tools/lexical_chunks/clause_practice.py) 的 `punctuation_clause_practice_spans`；测试：[test_clause_practice.py](../tools/lexical_chunks/test_clause_practice.py)。该模式不使用第 3 节的前置成分规则。

| 规则 | 条件 | 输入 → 片段题序 | 测试 |
| --- | --- | --- | --- |
| C1 从句候选 | spaCy 标为 `advcl/ccomp/xcomp/acl/relcl/csubj/csubjpass/pcomp` 且中心词是动词或助动词的子树才参与拆分。 | `I stayed because it rained.` → `I stayed` / `because it rained` / 整句 | `test_embedded_relative_and_adverbial_clauses` |
| C2 补语从句 | 完整从句与主句分开，再练所属片段。 | `I think that she is right; then I agree.` → `I think` / `that she is right` / `I think that she is right` / `then I agree.` / 整句 | `test_new_clause_steps_use_punctuation_parents` |
| C3 嵌入式从句 | 从句两侧各保留连续主句文字，不拼接非连续文字。 | `The book that I bought is good.` → `The book` / `that I bought` / `is good.` / 整句 | `test_embedded_relative_and_adverbial_clauses` |
| C4 嵌套从句 | 子从句先于包含它的父片段。 | `I know that she said that he left.` → `I know` / `that she said` / `that he left` / `that she said that he left` / 整句 | `test_nested_clauses_and_numeric_comma` |
| C5 无从句不拆 | 没有可用从句候选时保留标点父片段。 | `Birds sing.` → 整句 | `test_unsplit_sentence_and_utf16_offsets` |
| C6 越界或交叉不拆 | 候选越过标点父片段，或两个候选范围交叉时保留父片段。 | `Alpha beta gamma delta.`，候选范围 `[0,10)` 与 `[6,16)` 交叉 → `Alpha beta gamma delta.` | `test_crossing_or_out_of_parent_clause_candidates_do_not_split` |

## 5. 片段内实义词与功能词题（两种当前模式）

实现：[content_function_practice.py](../tools/lexical_chunks/content_function_practice.py) 的 `build_practice_steps`；测试：[test_content_function_practice.py](../tools/lexical_chunks/test_content_function_practice.py)。本节的箭头是**题型顺序**，不改变前面确定的片段边界。

| 规则 | 条件 | 输入 → 题序示例 | 测试 |
| --- | --- | --- | --- |
| W1 实义词 | 片段中的名词、专名、实义动词、形容词、副词、数词按原文顺序各练一次。 | `She put the book on the table.` → `put` / `book` / `table` / 功能词填空 / 整句 | `test_content_words_then_one_function_fill_then_whole` |
| W2 功能词填空 | 固定显示实义词，一题填回其余词元。 | `She put the book on the table.` → `___ put ___ book ___ ___ table.` | `test_content_words_then_one_function_fill_then_whole` |
| W3 无功能词 | 片段没有待填功能词时跳过填空，仍完整复现片段。 | `TIME MARCHED ON` → `TIME` / `MARCHED` / `ON` / `TIME MARCHED ON` | `test_uppercase_all_content_segment_is_replayed_before_next_segment` |
| W4 无实义词 | 片段提不出实义词时，只复现片段。 | `and I.` → `and I.` | `test_skips_fill_without_function_words_and_replays_segment_without_content` |
| W5 缩写词元 | 客户端作为一个可填词元的撇号缩写不拆成两题。 | `John's book isn't here.` → 实义词 `John's`、`book`、`here`；`isn't` 留在功能词填空 | `test_contractions_remain_one_editable_word_and_utf16_offsets_survive_emoji` |
| W6 组合与整句 | 最小片段完成词题后复现片段；较大组合片段只复现；完整原句最后练且不重复同文题。 | `I think that she is right.` → `I think` 的词题与复现 / `that she is right` 的词题与复现 / 整句 | `test_clause_parent_is_replayed_after_leaf_drills` |

## 6. 旧语块生成（保留备用，不用于新生成卡片）

实现：[split_lexical_chunks.py](../tools/lexical_chunks/split_lexical_chunks.py) 的 `generate_plan`；测试：[test_split_lexical_chunks.py](../tools/lexical_chunks/test_split_lexical_chunks.py)。以下箭头是实际学习单元序列或其中注明的连续摘录；此流程按固定 spaCy 依存树生成，与当前标点片段流程分开。

| 规则 | 条件 | 输入 → 学习单元示例 | 测试 |
| --- | --- | --- | --- |
| L1 单词单元 | 每个非标点、非空白词元都有独立单元，功能词也保留作组合来源。 | `The book fell.` → `The` / `book` / `The book` / `fell` / 整句 | `test_rule_index_small_legacy_sequences`、`test_function_words_are_available_as_review_sources` |
| L2 后序闭合 | 先生成子短语，再将闭合且相邻的子短语接到中心词。 | `The young teacher left.` → `The` / `young` / `teacher` / `young teacher` / `The young teacher` / `left` / 整句 | `test_rule_index_small_legacy_sequences` |
| L3 非叶先行 | 同一中心词的非叶分支先于叶分支，组内按原文顺序。 | `Researchers from Tulane University in the USA say any kind of light at bedtime could be bad for your heart.` → 连续摘录：`bad for your heart` / `could` / `be` / `could be` / `be bad for your heart` / `could be bad for your heart` | `test_leaf_child_follows_non_leaf_siblings_before_head` |
| L4 左右两侧 | 左右都有相邻闭合子短语时，先输出各单侧，再输出两侧合并。 | `She is happy.` → `She is` / `is happy` / 整句（序列摘录） | `test_rule_index_small_legacy_sequences` |
| L5 标点不挡邻接 | 邻接忽略标点和空白，生成的原文单元仍保留内部标点。 | `He smiled, and she laughed.` → 包含 `smiled, and`、`He smiled, and`、`she laughed`、整句 | `test_internal_punctuation_allows_local_closure_and_keeps_comma` |
| L6 字词间隔阻断 | 中间隔着其他词元或子短语未闭合时不强行合并。 | `I bought a book yesterday that explains grammar.` → 有 `a book` 和 `that explains grammar`，没有 `a book yesterday that explains grammar` | `test_word_gaps_still_block_unclosed_subtrees` |
| L7 不特判并列 | 并列结构仍按依存树闭合，不额外生成主谓并列组。 | `He smiled and she laughed.` → 包含 `smiled and`、`she laughed`、整句 | `test_coordination_follows_tree_without_special_grouping` |
| L8 引号保留 | 解析时忽略双引号，但单元和整句按原文范围输出。 | `“Run!”` → 整句 `“Run!”`；`She said"hello"today.` → 整句保留双引号 | `test_quoted_sentences_keep_independent_original_boundaries` |
| L9 引号重试 | 忽略双引号后若整句没有组合来源，只对该句按原文引号重新解析；成功时保留来源。 | `My future self had given me a few pieces of advice: “Consult Nanahoshi,” “Write Eris a letter,” and “Doubt the Man-God without opposing him.”` → 整句仍是原文，且可经来源追溯到 `had` | `test_blocked_quote_parse_retries_raw_sentence_for_full_span_sources` |
| L10 整句收尾 | 整句始终最后输出；能由组合覆盖时保留直接来源，否则仍追加整句。 | `Birds sing.` → `Birds` / `sing` / `Birds sing.` | `test_rule_index_small_legacy_sequences`、`test_word_gaps_still_block_unclosed_subtrees` |

## 新增或修改规则时

在所属阶段新增一行，写明**适用模式、触发条件、输入、实际拆分结果、实现位置和测试名称**；不拆分的例外也单独成行。先用固定模型和测试确认示例，再更新此索引及相关 ADR。原文范围与题序一旦保存，旧卡片不随规则变动重算。
