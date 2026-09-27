# 渐进学习单元

## 第 1 句

### 依存关系树

```text
say [ROOT, VERB]
├── Researchers [nsubj, NOUN]
│   └── from [prep, ADP]
│       └── University [pobj, PROPN]
│           ├── Tulane [compound, PROPN]
│           └── in [prep, ADP]
│               └── USA [pobj, PROPN]
│                   └── the [det, DET]
├── be [ccomp, AUX]
│   ├── kind [nsubj, NOUN]
│   │   ├── any [det, DET]
│   │   ├── of [prep, ADP]
│   │   │   └── light [pobj, NOUN]
│   │   └── at [prep, ADP]
│   │       └── bedtime [pobj, NOUN]
│   ├── could [aux, AUX]
│   └── bad [acomp, ADJ]
│       └── for [prep, ADP]
│           └── heart [pobj, NOUN]
│               └── your [poss, PRON]
└── . [punct, PUNCT]
```

| 序号 | 中文提示 | 英文答案 | 组合说明 |
|---:|---|---|---|
| 1 | 杜兰（大学名） | Tulane | 词元 |
| 2 | 这（定冠词） | the | 词元 |
| 3 | 美国 | USA | 词元 |
| 4 | 美国 | the USA | 中心词 USA；左接 the |
| 5 | 在 | in | 词元 |
| 6 | 在美国 | in the USA | 中心词 in；右接 the USA |
| 7 | 大学 | University | 词元 |
| 8 | 杜兰大学 | Tulane University | 中心词 University；左接 Tulane |
| 9 | 位于美国的大学 | University in the USA | 中心词 University；右接 in the USA |
| 10 | 位于美国的杜兰大学 | Tulane University in the USA | 中心词 University；左接 Tulane；右接 in the USA |
| 11 | 来自 | from | 词元 |
| 12 | 来自美国杜兰大学 | from Tulane University in the USA | 中心词 from；右接 Tulane University in the USA |
| 13 | 研究人员 | Researchers | 词元 |
| 14 | 来自美国杜兰大学的研究人员 | Researchers from Tulane University in the USA | 中心词 Researchers；右接 from Tulane University in the USA |
| 15 | 任何 | any | 词元 |
| 16 | 光；灯光 | light | 词元 |
| 17 | 的 | of | 词元 |
| 18 | 光的；光线的 | of light | 中心词 of；右接 light |
| 19 | 就寝时间 | bedtime | 词元 |
| 20 | 在 | at | 词元 |
| 21 | 就寝时 | at bedtime | 中心词 at；右接 bedtime |
| 22 | 种类 | kind | 词元 |
| 23 | 任何一种 | any kind | 中心词 kind；左接 any |
| 24 | 一种光 | kind of light | 中心词 kind；右接 of light |
| 25 | 任何一种光 | any kind of light | 中心词 kind；左接 any；右接 of light |
| 26 | 就寝时的任何一种光 | any kind of light at bedtime | 中心词 kind；右接 at bedtime |
| 27 | 可能 | could | 词元 |
| 28 | 你的 | your | 词元 |
| 29 | 心脏 | heart | 词元 |
| 30 | 你的心脏 | your heart | 中心词 heart；左接 your |
| 31 | 对；对于 | for | 词元 |
| 32 | 对你的心脏 | for your heart | 中心词 for；右接 your heart |
| 33 | 有害的；不好的 | bad | 词元 |
| 34 | 对你的心脏有害 | bad for your heart | 中心词 bad；右接 for your heart |
| 35 | 是 | be | 词元 |
| 36 | 可能会 | could be | 中心词 be；左接 could |
| 37 | 对你的心脏有害 | be bad for your heart | 中心词 be；右接 bad for your heart |
| 38 | 可能对你的心脏有害 | could be bad for your heart | 中心词 be；左接 could；右接 bad for your heart |
| 39 | 任何一种光在就寝时都可能对你的心脏有害 | any kind of light at bedtime could be bad for your heart | 中心词 be；左接 any kind of light at bedtime |
| 40 | 说；表示 | say | 词元 |
| 41 | 来自美国杜兰大学的研究人员表示 | Researchers from Tulane University in the USA say | 中心词 say；左接 Researchers from Tulane University in the USA |
| 42 | 表示，就寝时任何一种光都可能对你的心脏有害 | say any kind of light at bedtime could be bad for your heart | 中心词 say；右接 any kind of light at bedtime could be bad for your heart |
| 43 | 美国杜兰大学的研究人员表示，睡前任何光线都可能对你的心脏有害。 | Researchers from Tulane University in the USA say any kind of light at bedtime could be bad for your heart | 整句 |
