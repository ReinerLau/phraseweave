# 渐进学习单元

## 第 1 句

### 依存关系树

```text
be [ROOT, AUX]
├── sleeping [csubj, VERB]
│   └── with [prep, ADP]
│       └── light [pobj, NOUN]
│           ├── a [det, DET]
│           └── on [prep, ADP]
├── could [aux, AUX]
├── bad [acomp, ADJ]
├── for [prep, ADP]
│   └── you [pobj, PRON]
└── . [punct, PUNCT]
```

| 序号 | 中文提示 | 英文答案 | 组合说明 |
|---:|---|---|---|
| 1 | 一盏（不定冠词） | a | 词元 |
| 2 | 开着；处于开启状态 | on | 词元 |
| 3 | 灯 | light | 词元 |
| 4 | 一盏灯 | a light | 中心词 light；左接 a |
| 5 | 亮着的灯 | light on | 中心词 light；右接 on |
| 6 | 一盏亮着的灯 | a light on | 中心词 light；左接 a；右接 on |
| 7 | 伴随着；带着 | with | 词元 |
| 8 | 开着灯 | with a light on | 中心词 with；右接 a light on |
| 9 | 睡觉 | sleeping | 词元 |
| 10 | 开着灯睡觉 | sleeping with a light on | 中心词 sleeping；右接 with a light on |
| 11 | 可能 | could | 词元 |
| 12 | 有害的；不好的 | bad | 词元 |
| 13 | 你 | you | 词元 |
| 14 | 对；对于 | for | 词元 |
| 15 | 对你来说 | for you | 中心词 for；右接 you |
| 16 | 是 | be | 词元 |
| 17 | 可能是；可能会 | could be | 中心词 be；左接 could |
| 18 | 是有害的 | be bad | 中心词 be；右接 bad |
| 19 | 可能有害 | could be bad | 中心词 be；左接 could；右接 bad |
| 20 | 开着灯睡觉可能有害 | sleeping with a light on could be bad | 中心词 be；左接 sleeping with a light on |
| 21 | 可能对你有害 | could be bad for you | 中心词 be；右接 for you |
| 22 | 开着灯睡觉可能对你有害。 | sleeping with a light on could be bad for you | 整句 |
