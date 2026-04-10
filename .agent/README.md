# .agent/ — AIエージェントハーネス

> このディレクトリは、複数のAIエージェント（Antigravity / Claude Code / Cursor 等）が
> プロジェクトを理解し、一貫した方法で作業するための共有基盤です。

## ディレクトリ構成

```
.agent/
├── rules/          常時・条件付きで適用されるルール
├── workflows/      タスク実行の手順定義
├── skills/         オンデマンド参照の専門手順書
├── plans/          実装計画の永続ファイル
├── tasks/          タスク進捗のチェックリスト
├── memory/         エージェント横断の永続知識ベース
└── README.md       ← このファイル
```

## 各ディレクトリの役割

### `rules/` — 行動ルール
エージェントが常に従うべきルール。コンテキストに自動ロードされる。
- `global.md`: 全タスク共通の基本ルール
- `toio-ble.md`: BLE実装時の条件付きルール
- `ui-frontend.md`: UI変更時の条件付きルール
- `ollama-llm.md`: LLM連携時の条件付きルール

### `workflows/` — ワークフロー定義
特定のタスクパターンに対する手順書。`/command` で呼び出し可能。
- `implement.md`: Plan → Code → Evaluate の実装サイクル
- `self-improve.md`: エラーからルールを改善するフロー
- `git-push.md`: コミット → プッシュの標準手順

### `skills/` — オンデマンドスキル
必要な時だけ参照する専門知識。rulesと異なりコンテキストを常時消費しない。
- `debug-ble.md`: BLEデバッグの定型手順
- `git-commit.md`: コミットメッセージ規約

### `plans/` — 実装計画
機能実装やバグ修正の計画書。命名: `YYYY-MM-DD_<slug>.md`
- 作業中は `status: in-progress`、完了後は `status: done` に更新
- 別エージェントがここを読んで作業を引き継げる

### `tasks/` — タスク追跡
plans/ に対応するチェックリスト。命名: `YYYY-MM-DD_<slug>.md`
- `[ ]` 未着手 / `[/]` 進行中 / `[x]` 完了

### `memory/` — 永続知識ベース
プロジェクト全体の知見を蓄積する。全エージェントが読み書きする。
- `architecture.md`: スタック・ファイル構成・データフロー
- `decisions.md`: 設計判断ログ（ADR形式）
- `known-issues.md`: 既知のバグとワークアラウンド

## エージェント別の使い方

| エージェント | 主な参照先 | 備考 |
|---|---|---|
| **Antigravity** | rules/ → workflows/ → plans/tasks/ | user_rulesでglobal.mdを自動読み込み |
| **Claude Code** | CLAUDE.md → rules/ → memory/ | CLAUDE.mdからこのREADMEにポイント |
| **Cursor** | .cursorrules → memory/ | プロジェクトコンテキストとして参照 |
