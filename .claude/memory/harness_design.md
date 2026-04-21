---
name: ハーネス設計の方針
description: Claude Code ハーネス (CLAUDE.md / .claude/ / .agent/) の役割分担と動作モード
type: reference
originSessionId: 2d111c42-a492-48f3-9e82-a58d0c6f5401
---
## ハーネスの構成

Claude Code をメインエージェントとして運用する。記憶は自動メモリに一元化。

| パス | 用途 | 編集権 |
|---|---|---|
| `~/.claude/CLAUDE.md` | グローバル動作規約（承認モード、コミット規約） | Claude Code が更新可 |
| `~/.claude/settings.json` | グローバル設定 (`bypassPermissions`, model, effortLevel) | Claude Code が更新可 |
| `<project>/.claude/memory/` | **本プロジェクトの記憶の正本**（自動メモリ・コミット対象） | Claude Code が随時更新 |
| `<project>/CLAUDE.md` | プロジェクト固有の規約・スタック | Claude Code が更新可 |
| `<project>/.claude/settings.json` | プロジェクト固有の hooks / 権限 | Claude Code が更新可 |
| `<project>/.agent/rules/`, `.agent/workflows/` | 他エージェント (Cline / Roo Code) 用資産 | **Claude Code は触らない** |
| `<project>/.agent/plans/`, `.agent/tasks/` | 計画・タスク（共有） | Claude Code も追記する |
| ~~`<project>/.agent/memory/`~~ | **撤去済み** — 記憶は自動メモリへ統合 | — |

## 動作モード

`bypassPermissions` 有効。書き込み前承認は不要。例外は `~/.claude/CLAUDE.md` の動作モード節を参照（不可逆操作・外部公開操作のみ要確認）。

**Why:** ユーザーがグローバルで `bypassPermissions` を選択。`.agent/rules/global.md` の「承認を得ること」は他エージェント向け規約なので、グローバル CLAUDE.md で上書き宣言してある。

## Hooks (本プロジェクト)

`PostToolUse` (Write|Edit) で `scripts/post-edit-hook.js` → `.ps1` に UTF-8 BOM、`.bat` に Shift-JIS を自動付与。CLAUDE.md ルール 9（Windows エンコーディング）の自動化。

## 計画ファイル

`.agent/plans/YYYY-MM-DD_<slug>.md` にフロントマター付き Markdown で記録。`status: in-progress` / `done` で管理。
