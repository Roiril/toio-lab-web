---
status: in-progress
created: 2026-04-21
updated: 2026-04-21
slug: claude-code-harness
---

# Claude Code ハーネス設計

## 概要
Claude Code ネイティブのハーネスを段階的に構築する。
既存の `.agent/` 資産を `@` 参照で取り込み、二重管理を防ぐ。

## フェーズ

### Phase 1: 基盤 ← 完了
- [x] `CLAUDE.md` 新規作成（ルート）
- [x] `.claude/settings.json` 整理（model 削除）
- [x] `.claude/mcp.json` 削除（mcp-server 不在）
- [x] `.mcp.json` 削除（同上）
- [x] `.gitignore` 更新（.claude/ の管理方針変更）
- [x] 動作確認（CLAUDE.md / settings.json が読み込まれ、`@` import も解決）

### Phase 2: ツール層（次回）
- [ ] `.claude/commands/` カスタムスラッシュコマンド
- [ ] `.claude/skills/` スキル定義（必要に応じて）

### Phase 3: 監督層 ← 部分実施
- [x] PostToolUse hook: `scripts/post-edit-hook.js` 経由で `.ps1` (UTF-8 BOM) / `.bat` (Shift-JIS) を自動再エンコード — CLAUDE.md ルール 9 の自動化
- [ ] PreToolUse hook（`.env` 編集ガード等）
- [ ] SessionStart hook（環境チェック等）

## 自律改善ログ (2026-04-21)

- メモリの陳腐化を解消: `recent_changes.md` 削除、`project_overview.md` を MCP 削除後の構成に書き換え
- ハーネス役割整理メモを追加: `harness_design.md`（`.agent/` と `.claude/` の編集権限と動作モードの境界を明記）
- `CLAUDE.md` に "Claude Code 固有の動作モード" セクションを追加（`bypassPermissions` と `.agent/rules/global.md` の承認規約の整合）
- ハーネス: `scripts/encode-after-edit.ps1` + `scripts/post-edit-hook.js` + `.claude/settings.json` で .ps1/.bat の自動エンコード hook を実装
