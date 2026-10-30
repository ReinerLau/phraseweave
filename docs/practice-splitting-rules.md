# 练习拆分规则索引

这里记录当前生成流程和旧题序示例。当前流程依次分句、按标点分段、依据完整原句的依存树递归组合，再生成最小片段的词题。示例以固定版本 spaCy 的实际输出为准；已保存的旧卡片不重算。

依存子树延伸到后续标点片段时，如果当前片段内的词仍通过片段内的依存关系连接到该成分，可以只按当前片段内的部分继续拆分；跨界后又返回当前片段的结构仍保守保留。

## 1. 分句

实现：[sentence_review.py](../tools/lexical_chunks/sentence_review.py) 的 `split_sentences`。本阶段输出原句列表，尚不生成片段题。

### S1 句末边界

- **条件：** `.?!` 后是空白或文本结束时分句。

**输入：**

```text
Birds sing. Cats sleep?
```

**分句结果：**

```text
Birds sing.
Cats sleep?
```

### S2 连续符号与闭合引号

- **条件：** 连续句末符号和紧随的闭合引号留在前句。

**输入：**

```text
“Go now?!” She left?
```

**分句结果：**

```text
“Go now?!”
She left?
```

### S3 空段落

- **条件：** 空行也结束当前原句。

**输入：**

```text
Birds sing

Cats sleep
```

**分句结果：**

```text
Birds sing
Cats sleep
```

### S4 缩写不分句

- **条件：** 已识别的头衔和缩写内部句点不结束原句。

**输入：**

```text
Dr. Smith paid, e.g. for lunch. Ms. Lee smiled.
```

**分句结果：**

```text
Dr. Smith paid, e.g. for lunch.
Ms. Lee smiled.
```

### S5 小数不分句

- **条件：** 两侧是数字的句点不结束原句。

**输入：**

```text
He paid 3.14 dollars. She left.
```

**分句结果：**

```text
He paid 3.14 dollars.
She left.
```

### S6 无句末符号

- **条件：** 非空尾文本仍作为一个原句。

**输入：**

```text
Birds sing
softly
```

**分句结果：**

```text
Birds sing
softly
```

### S7 无可练文字

- **条件：** 全空输入或只有标点的原句报错，不生成题目。

**输入：**

```text
Birds sing. ...
```

**分句结果：**

```text
报错：第 2 句没有词元
```

## 2. 标点分段

实现：[sentence_review.py](../tools/lexical_chunks/sentence_review.py) 的 `punctuation_practice_spans`。以下示例只列片段复现题，省略片段内的实义词与功能词题。

### P1 分隔符

- **条件：** 逗号、分号、冒号、长破折号 `—` 划出连续片段。

**输入：**

```text
A, B; C: D—E.
```

**片段题序：**

```text
A
B
C
D
E.
A, B; C: D—E.
```

### P2 数字内部不拆

- **条件：** 数字两侧的逗号和冒号保留在同一片段。

**输入：**

```text
Bring 1,000 books at 12:30; leave.
```

**片段题序：**

```text
Bring 1,000 books at 12:30
leave.
Bring 1,000 books at 12:30; leave.
```

### P3 网址内部不拆

- **条件：** URL 中的冒号、逗号、分号不作边界。

**输入：**

```text
See https://example.com:8080/a,b; leave.
```

**片段题序：**

```text
See https://example.com:8080/a,b
leave.
See https://example.com:8080/a,b; leave.
```

### P4 其他符号不拆

- **条件：** 撇号、引号、括号、连字符、短破折号 `–`、斜杠不作边界；句末 `.?!` 已由分句阶段处理。

**输入：**

```text
Don't split "well-known" 3/4 (quoted) – now.
```

**片段题序：**

```text
Don't split "well-known" 3/4 (quoted) – now.
```

### P5 无空题

- **条件：** 相邻分隔符之间没有可练文字时跳过空段。

**输入：**

```text
A; : — B.
```

**片段题序：**

```text
A
B.
A; : — B.
```

### P6 边缘分号冒号

- **条件：** 分号或冒号两侧没有可练文字时不作边界。

**输入：**

```text
A: B;
```

**片段题序：**

```text
A
B;
A: B;
```

### P7 无有效分段

- **条件：** 不足两个可练片段时只练整句。

**输入：**

```text
Birds sing.
```

**片段题序：**

```text
Birds sing.
```

## 3. 依存关系递归组合

实现：[dependency_practice.py](../tools/lexical_chunks/dependency_practice.py) 的 `build_dependency_steps`。以下只列片段复现题；最小连续片段还会先练实义词及功能词。每个成分先单独练，再接回当前核心。无法可靠定位的结构保留上层片段。

### D1 宾语、介词宾语与后置状语

**输入：** `we’d finished the project in only three months.`

```text
we’d finished
the project
we’d finished the project
only three months
in only three months
we’d finished the project in only three months.
```

名词后的 `of` 短语与其中心名词保持整体，例如 `a lot of money`、`a cup of coffee` 和 `the end of the story`；不单独生成 `of money` 等片段题，整体内部仍练实义词和功能词。其他介词短语及从句仍按现有规则拆分。

### D2 句中状语的逐步组合

**输入：** `She quietly finished the project.`

```text
She
finished
She finished
quietly
She quietly finished
the project
She quietly finished the project.
```

`She finished` 按原文词序组合已练成分，之后再加入 `quietly`。缩写仍作为一个可输入词元。

### D3 双宾语与从句内部递归

`She gave him the book.` 中先练 `She gave`，再分别练 `him`、`the book` 并逐个接回。`She took the project that we had finished in three months.` 中，在复现完整宾语前先练从句里的 `we had finished`、`that`、`three months` 和 `in three months`。

## 历史规则：前置成分与主谓核心拆分

以下是 schema 8 及更早卡片的历史题序，新卡片使用上面的递归规则。

实现：[fronted_practice.py](../tools/lexical_chunks/fronted_practice.py) 的 `syntactic_practice_spans`。每条原句只按完整原句解析，标点片段用于限定练习范围，不重新解析片段。只有主语之前的文字完整由非从句前置状语及可选连接词组成，才拆出前置成分；多个连续前置成分合成一段。主语范围完整且后接可靠谓语时，主语和谓语先分别练，再复现主谓核心；随后练单独拆出的前置成分，并复现包含它的原标点片段。组合关系决定题序，不生成“前置状语 + 主语”片段。拆分不设词数门槛。以下示例只列片段复现题，省略片段内的实义词与功能词题。

### F1 时间状语

- **条件：** 前置副词短语完整修饰主句谓语。

**输入：**

```text
and soon enough another month had passed.
```

**片段题序：**

```text
another month
had passed.
another month had passed.
and soon enough
and soon enough another month had passed.
```

### F2 地点或时间介词短语

- **条件：** 前置介词短语完整位于主语之前。

**输入：**

```text
In the morning she left.
```

**片段题序：**

```text
she
left.
she left.
In the morning
In the morning she left.
```

### F3 多个前置成分

- **条件：** 连续的完整前置成分合为一个片段。

**输入：**

```text
Yesterday in the morning we left.
```

**片段题序：**

```text
we
left.
we left.
Yesterday in the morning
Yesterday in the morning we left.
```

### F4 只有连接词不拆

- **条件：** 主语前只有 `and` 等连接词，没有前置状语。

**输入：**

```text
And another month had passed.
```

**片段题序：**

```text
And another month had passed.
```

### F5 句中修饰语不作为前置成分拆

- **条件：** 状语位于主语之后。

**输入：**

```text
She quietly left.
```

**片段题序：**

```text
She
quietly left.
She quietly left.
```

### F6 不可靠边界不拆

- **条件：** 前缀含有无法归入完整前置成分的文字，或解析无法确认主句主语。

**输入：**

```text
😀 And then she left.
```

**片段题序：**

```text
😀 And then she left.
```

### P1 主语与谓语

- **条件：** 完整原句的依存关系确认片段以完整主语开头，后面是主谓核心的谓语；先练两侧，再复现核心。

**输入：**

```text
The Magic Armor Mark One was now complete.
```

**片段题序：**

```text
The Magic Armor Mark One
was now complete.
The Magic Armor Mark One was now complete.
```

### P2 短句也拆

- **条件：** 不设词数门槛，两侧各只有一个词也拆。

**输入：**

```text
Birds sing.
```

**片段题序：**

```text
Birds
sing.
Birds sing.
```

### P3 无可靠主语不拆

- **条件：** 祈使句、倒装句、无可定位的名词性主语或前缀无法归入完整前置成分时，不强行生成主谓片段；已有可靠的前置成分拆分仍可保留。

**输入：**

```text
Open the door.
```

**片段题序：**

```text
Open the door.
```

## 4. 片段内实义词与功能词题

实现：[dependency_practice.py](../tools/lexical_chunks/dependency_practice.py) 的 `build_dependency_steps`。最小连续片段先练词题，再复现片段；较大的组合片段只复现。

### W1 实义词

- **条件：** 片段中的名词、专名、实义动词、形容词、副词、数词按原文顺序各练一次。

**输入：**

```text
She put the book.
```

**`the book` 片段的连续题序：**

```text
book
___ book
the book
```

### W2 功能词填空

- **条件：** 固定显示实义词，一题填回其余词元。

**输入：**

```text
She put the book.
```

**`the book` 片段中的填空题：**

```text
___ book
```

### W3 无功能词

- **条件：** 片段没有待填功能词时跳过填空，仍完整复现片段。

**输入：**

```text
Run.
```

**题序示例：**

```text
Run
Run
Run.
```

### W4 无实义词

- **条件：** 片段提不出实义词时，只复现片段。

**输入：**

```text
She runs.
```

**`She` 片段的题序：**

```text
She
```

### W5 缩写词元

- **条件：** 客户端作为一个可填词元的撇号缩写不拆成两题。

**输入：**

```text
John's book isn't here.
```

**题序示例：**

```text
John's
book
John's book
isn't
John's book isn't
here
John's book isn't here.
```

- **说明：** `isn't` 保持为一个词元，不切成 `is` 和 `n't`。

### W6 组合与整句

- **条件：** 最小片段完成词题后复现片段；较大组合片段只复现；完整原句最后练且不重复同文题。

**输入：**

```text
She quietly finished the project.
```

**片段复现题序：**

```text
主语：She
谓语：finished
主谓：She finished
状语：quietly
接入状语：She quietly finished
宾语：the project
整句：She quietly finished the project.
```

- **说明：** 此处展示生成器预览标签，只列片段复现题；最小片段内的词题见 W1–W5。状语不细分时间、地点或方式。宾语统一标“宾语”，包括间接宾语和介词内部的宾语；完整介词短语按其在句中的作用标为“状语”“定语”或“补语”等，接回句子时标明接入的成分。解析不足以可靠判断时标“片段”。标签只用于预览，不写入保存的题序。

## 5. 旧语块生成（保留备用，不用于新生成卡片）

实现：[split_lexical_chunks.py](../tools/lexical_chunks/split_lexical_chunks.py) 的 `generate_plan`。以下结果是实际学习单元序列或其中注明的连续摘录；此流程按固定 spaCy 依存树生成，与当前标点片段流程分开。

### L1 单词单元

- **条件：** 每个非标点、非空白词元都有独立单元，功能词也保留作组合来源。

**输入：**

```text
The book fell.
```

**学习单元示例：**

```text
The
book
The book
fell
The book fell.
```

### L2 后序闭合

- **条件：** 先生成子短语，再将闭合且相邻的子短语接到中心词。

**输入：**

```text
The young teacher left.
```

**学习单元示例：**

```text
The
young
teacher
young teacher
The young teacher
left
The young teacher left.
```

### L3 非叶先行

- **条件：** 同一中心词的非叶分支先于叶分支，组内按原文顺序。

**输入：**

```text
Researchers from Tulane University in the USA say any kind of light at bedtime could be bad for your heart.
```

**学习单元示例：**

```text
bad for your heart
could
be
could be
be bad for your heart
could be bad for your heart
```

- **说明：** 以上为连续摘录。

### L4 左右两侧

- **条件：** 左右都有相邻闭合子短语时，先输出各单侧，再输出两侧合并。

**输入：**

```text
She is happy.
```

**学习单元示例：**

```text
She is
is happy
She is happy.
```

- **说明：** 以上为序列摘录。

### L5 标点不挡邻接

- **条件：** 邻接忽略标点和空白，生成的原文单元仍保留内部标点。

**输入：**

```text
He smiled, and she laughed.
```

**学习单元示例：**

```text
smiled, and
He smiled, and
she laughed
He smiled, and she laughed.
```

- **说明：** 结果包含以上学习单元；未列出完整序列。

### L6 字词间隔阻断

- **条件：** 中间隔着其他词元或子短语未闭合时不强行合并。

**输入：**

```text
I bought a book yesterday that explains grammar.
```

**学习单元示例：**

```text
a book
that explains grammar
```

- **说明：** 结果包含以上学习单元，不生成 `a book yesterday that explains grammar`。

### L7 不特判并列

- **条件：** 并列结构仍按依存树闭合，不额外生成主谓并列组。

**输入：**

```text
He smiled and she laughed.
```

**学习单元示例：**

```text
smiled and
she laughed
He smiled and she laughed.
```

- **说明：** 结果包含以上学习单元；未列出完整序列。

### L8 引号保留

- **条件：** 解析时忽略双引号，但单元和整句按原文范围输出。

**输入 1：**

```text
“Run!”
```

**学习单元示例 1：**

```text
“Run!”
```

**输入 2：**

```text
She said"hello"today.
```

**学习单元示例 2：**

```text
She said"hello"today.
```

### L9 引号重试

- **条件：** 忽略双引号后若整句没有组合来源，只对该句按原文引号重新解析；成功时保留来源。

**输入：**

```text
My future self had given me a few pieces of advice: “Consult Nanahoshi,” “Write Eris a letter,” and “Doubt the Man-God without opposing him.”
```

**学习单元示例：**

```text
My future self had given me a few pieces of advice: “Consult Nanahoshi,” “Write Eris a letter,” and “Doubt the Man-God without opposing him.”
```

- **说明：** 整句可经来源追溯到 `had`。

### L10 整句收尾

- **条件：** 整句始终最后输出；能由组合覆盖时保留直接来源，否则仍追加整句。

**输入：**

```text
Birds sing.
```

**学习单元示例：**

```text
Birds
sing
Birds sing.
```

## 新增或修改规则时

在所属阶段新增一个规则子标题，写明**适用模式、触发条件、可复制的输入、实际拆分结果、实现位置**；不拆分的例外也使用独立子标题。先用固定模型确认示例，再更新此索引及相关 ADR。原文范围与题序一旦保存，旧卡片不随规则变动重算。
