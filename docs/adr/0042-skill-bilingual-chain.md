# 0042 Skill 生成双语练习链

状态为已采用。新练习生成流程取代 ADR 0040 和 0041 的生成决策，旧数据继续使用保存的题序。

Codex 依据仓库维护的 phraseweave Skill 构建练习内容，通过 CLI 调用本地服务。服务负责解析交替行文本、校验、事务写入和返回练习地址。

新格式 `schema_version: 11` 包含可选 `title` 和有序 `entries`，每条含 `english`、`chinese`。存储复用已有练习结构，课程标记 `practiceSequence: bilingual-chain-v1`，每条独立 ID，提示随练习保存。新练习默认单题展示，可切换全文，复习仍遍历全部条目。

`POST /api/local-exercises/import` 接受 `text`、可选 `title`、UUID `requestId`，返回 `exerciseId`、`courseId`、`title`、`count`、`path`。CLI 补充本地绝对 `url`。同一 ID 与相同内容返回已有结果，内容冲突或先前练习已删除时返回 409；格式错误返回 400。幂等记录与练习、清单在同一 SQLite 事务写入。

自动导入持有后台保活状态，`phraseweave stop` 解除该状态。现有桌面及终端连接仍控制其会话生命周期。新练习不需要翻译服务；旧练习按需翻译和发音能力保留。
