# PhraseWeave

在 Codex 中调用 phraseweave Skill，把英文原文变成双语练习链，自动导入本地练习清单，然后打开返回的链接练习。每条练习看中文输入英文，支持发音、空格确认和回车求助。

## 本地开发

在 Apple Silicon Mac 上运行 `pnpm install` 和 `pnpm cli:build`。运行 `pnpm cli:dev` 可打开本地应用。

将仓库的 `skills/phraseweave/SKILL.md` 链接到 `~/.codex/skills/phraseweave/SKILL.md`，新开 Codex 对话后调用。链接到仓库的 Skill 在其他目录也会使用这里的本地开发版。使用已支持导入的 CLI 发布版时，可以将 Skill 目录复制到 Codex 的 Skills 目录。

```sh
PHRASEWEAVE_DEV_RUNTIME=1 node apps/cli/bin/phraseweave.mjs import \
  --file /absolute/path/chain.txt --title "练习标题" \
  --request-id 2c58630a-7322-4f2f-a0ca-6e56ea56e9ac --json
```

输入文件交替包含英文和中文，每个单元两行。导入返回直达练习链接，重复请求使用同一个 UUID。后台服务由导入命令自动启动，可用 `phraseweave stop` 解除后台保活。桌面及终端仍有会话时，服务继续运行。

练习链直接使用 Skill 提供的译文。发音环境在后台准备，旧练习缺失的中文提示仍通过 Index-Translate 获取。已有练习、保存的题序和进度继续可用。

安装发布版与远程访问见 [CLI 使用说明](apps/cli/README.md)。
