# Lab Social Simulation

An anonymous source artifact for a bilingual social simulation game with language-model NPCs.

## Run locally

Use Python 3.12 or later. Run from this directory:

```sh
python -m pip install -r requirements.txt
python run_game.py
```

Open the localhost address printed by the launcher. Choose English or Chinese in the game. The game follows a newcomer joining a laboratory project: talk with the characters, inspect the shared computer, edit and send report versions, respond to feedback, submit the project, and discuss contributions. The story and endings follow actual actions and character responses.

Generated NPC conversations require a model-provider account configured on your own machine. Copy `.env.example` to `.env.local` and supply your own credentials there, or set the corresponding environment variables. Credentials stay on the local server. Optional voice and illustration features need their corresponding provider settings. Opening the interface does not establish that a complete generated playthrough has been tested.

The default launcher starts a standalone local game. For the complete two-game flow, local accounts, save/recovery and integrated questionnaires:

```sh
python run_game.py --paired
```

The paired flow uses a new local data directory. Follow the launcher instructions for its localhost entry. Run the artifact in its own directory. Provider calls may be billed by the provider.

## Questionnaires

The complete questionnaires are available without running the game:

- [English: readable Markdown](questionnaires/en.md) · [English: standalone HTML](questionnaires/en.html)
- [中文：Markdown](questionnaires/zh-CN.md) · [中文：独立 HTML](questionnaires/zh-CN.html)
- [Questionnaire order / 问卷顺序](questionnaires/README.md)

The current instrument contains 59 distinct bilingual item templates. Each selected X→Y or Y→X sequence has 66 response positions across the five administration points. Use one sequence for a participant; the documents contain both complete sequences for review. Responses may be skipped. There is no follow-up questionnaire.

## Game implementation

`index.html`, `src/`, the stylesheets and `assets/` implement the room, character interactions, shared-computer workspace, report revision, contribution discussion and ending recaps. The Python server provides configurable model and optional media interfaces. The NPC implementation includes event-bound knowledge, conversational memory and optional persistent attribute/strategy evolution. Game state bookkeeping and validation are part of the game implementation.

The paired game and questionnaire modules provide a fresh local installation with its own data. No credentials or participant records are supplied with this artifact.

## 中文运行说明

安装 Python 3.12 或更新版本，在本目录安装依赖后执行 `python run_game.py`，打开终端打印的本机地址。可在游戏中切换中英文。玩家扮演刚加入实验室的新人，通过对话、查阅材料、修改报告、送审、正式提交和贡献讨论推进剧情。

如需生成 NPC 对话，请将 `.env.example` 复制为 `.env.local`，在本机填写自己的模型服务配置。语音和插画属于可选功能。`python run_game.py --paired` 启动本机双局流程、账号、保存恢复及集成问卷；使用全新的本地数据目录。完整中英文问卷也可直接打开上方文档。

## Third-party materials

Third-party asset notices and license terms are retained in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and alongside the corresponding files in `vendor/`. Those credits identify the asset providers, not the anonymous project authors.
