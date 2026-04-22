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

## Hooks

汎用ガードは `~/.claude/hooks/` にグローバル配置し、`~/.claude/settings.json` で全プロジェクト共通に登録済み（2026-04-22 移行）。

### グローバル (`~/.claude/hooks/`)

| イベント | スクリプト | 役割 |
|---|---|---|
| `SessionStart` | `session-start.js` | 直近コミット / 未コミット差分 / 進行中 plan (`.agent/plans/`) を stdout → コンテキスト注入 |
| `PreToolUse` (Bash\|Write\|Edit\|NotebookEdit) | `pre-tool-use-guard.js` | `git push --force` / `git reset --hard` / `git branch -D` / `rm -rf /~` / `.env` 編集 / `npm/yarn/pnpm/pip uninstall` に `permissionDecision: ask` を返す安全弁 |
| `PostToolUse` (Write\|Edit) | `post-edit-hook.js` → `encode-after-edit.ps1` | `.ps1` に UTF-8 BOM、`.bat` に Shift-JIS を自動付与 |

### プロジェクト (`.claude/hooks/`)

| イベント | スクリプト | 役割 |
|---|---|---|
| `PreToolUse` (Write\|Edit\|NotebookEdit) | `pre-tool-use-guard.js` | toio-lab-web 固有：`js/config.js` 手動編集を `ask` に降格（`start-app.bat` が自動生成） |

**Why:** `bypassPermissions` 全開の保険としてグローバル PreToolUse ガードを入れ、SessionStart で前回セッションの続きを毎回手動確認せずに済む構成（Anthropic「Effective Harnesses for Long-Running Agents」より）。共通分をグローバル化することで新規プロジェクトでも同じ運用が即座に立ち上がる。
**How to apply:** 新しいプロジェクト固有ガードは `.claude/hooks/` と `.claude/settings.json` に追加。グローバル側と並行実行される。

## 計画ファイル

`.agent/plans/YYYY-MM-DD_<slug>.md` にフロントマター付き Markdown で記録。`status: in-progress` / `done` で管理。
