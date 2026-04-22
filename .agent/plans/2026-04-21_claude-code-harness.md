---
status: in-progress
created: 2026-04-21
updated: 2026-04-22
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

### Phase 2: ツール層
- [x] `.claude/commands/commit.md` — 日本語コミット規約コマンド
- [x] `.claude/commands/plan.md` — 計画ファイル作成コマンド
- [ ] `.claude/skills/` スキル定義（必要に応じて）
- [ ] `.claude/agents/` カスタムサブエージェント（必要に応じて）

### Phase 3: 監督層 ← 部分実施
- [x] PostToolUse hook: `scripts/post-edit-hook.js` 経由で `.ps1` (UTF-8 BOM) / `.bat` (Shift-JIS) を自動再エンコード — CLAUDE.md ルール 9 の自動化
- [ ] PreToolUse hook（`.env` 編集ガード等）
- [ ] SessionStart hook（環境チェック等）

## 自律改善ログ (2026-04-21)

- メモリの陳腐化を解消: `recent_changes.md` 削除、`project_overview.md` を MCP 削除後の構成に書き換え
- ハーネス役割整理メモを追加: `harness_design.md`（`.agent/` と `.claude/` の編集権限と動作モードの境界を明記）
- `CLAUDE.md` に "Claude Code 固有の動作モード" セクションを追加（`bypassPermissions` と `.agent/rules/global.md` の承認規約の整合）
- ハーネス: `scripts/encode-after-edit.ps1` + `scripts/post-edit-hook.js` + `.claude/settings.json` で .ps1/.bat の自動エンコード hook を実装

## 自律改善ログ (2026-04-22)

- Anthropic 公式 best practices を調査し、現状のハーネスを評価 → 主要項目（CLAUDE.md 階層 / hooks / memory / permissions）は既に充足。ギャップは「領域別ルールが Claude Code から不可視」「カスタムコマンド未整備」の 2 点に特定
- 根 `CLAUDE.md` の「Claude Code は読まない」記述を撤回し、`.agent/rules/*.md`（toio-ble, ollama-llm, ui-frontend, global）を領域別ルールとして明示的にリンク
- `.claude/commands/commit.md`（日本語コミット規約）と `.claude/commands/plan.md`（計画ファイル作成）を新設 — Phase 2 の `.claude/commands/` を着手
- `.claude/` ハーネス構造を `CLAUDE.md` に新規セクションとして記載し、Claude Code 側の資産を俯瞰可能に
- 外部 best practices 調査（Web Bluetooth / LLM / UI セキュリティ / Canvas）を `.agent/rules/` に反映:
    - `toio-ble.md`: gattserverdisconnected + 指数バックオフ、再接続後の characteristic 再取得、write キュー直列化（既存実装 `_enqueueWrite` に準拠）、HTTPS / Permissions Policy 要件
    - `ollama-llm.md`: 並列 tool_call の id ベースマッピング、`OLLAMA_ORIGINS="*"` 禁止、Gemini rate limit / API キー露出の注意、構造化エラーレスポンス
    - `ui-frontend.md`: `escapeHTML` vs DOMPurify の使い分け（HTML レンダリング時は DOMPurify）、`requestAnimationFrame` + 差分再描画、aria-live / WCAG AA コントラスト
