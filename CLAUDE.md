# toio Lab Web

ブラウザから LLM（Ollama / Gemini）を呼び出し、自然言語で toio コアキューブを操作する Web アプリ。

## スタック

- **フロントエンド**: Vanilla HTML/CSS/JS（ビルドツール不使用）
- **LLM**: Ollama（ローカル） or Google Gemini API
- **ハードウェア**: toio コアキューブ — Web Bluetooth API
- **シミュレーション**: Canvas 2D（toio-sim.js）
- **開発サーバー**: `node scripts/dev-server.js`（ポート 3000）

## 起動コマンド

```bash
# LLM サーバー (Ollama)
.\start-llm.bat

# Web アプリ
.\start-app.bat

# 開発サーバー単体
node scripts/dev-server.js
```

## ファイル構成

主要ファイルは [README.md](README.md) と `js/` 配下のソース冒頭コメントを参照。アーキテクチャの全体像は自動メモリ `project_overview.md` に集約済み。

## コーディング規約

### 必須ルール
- **ビルドレス**: バンドラー・トランスパイラ不使用。`<script>` 直接読み込み
- **CSS**: 既存の CSS 変数（`var(--accent-cyan)` 等）と `glass-panel` クラスを再利用
- **DOM**: イベントリスナーの多重登録を防ぐ。`escapeHTML` でサニタイズ
- **BLE**: コマンド送信後は適切なディレイを挟む。操作前に `isConnected` チェック
- **LLM**: Ollama URL はハードコードしない。ツール定義は `tools-schema.js` に集約

### Windows 環境
- **PowerShell (.ps1)**: 日本語を含む場合は UTF-8 with BOM
- **バッチ (.bat)**: ASCII のみ。日本語は PowerShell に委譲
- **配列コアーション**: `@(...)` で配列型を強制

## 自動テスト運用（ラファエル）

UI / LLM / ツール呼び出しに関わる変更後は、以下を自律的に実行して検証する。

1. **dev-server をバックグラウンド起動**: `node scripts/dev-server.js` を `run_in_background` で実行し、BashOutput でターミナルログを随時確認する
2. **Playwright MCP でブラウザ検証**: `.mcp.json` 経由の `@playwright/mcp` で `http://localhost:3000` を開き、
   - DOM 操作でシミュレータ経路（`toio-sim.js`）の動作を確認
   - `console.*` / `pageerror` を収集し、エラー・警告がないことを検証
3. **実機 BLE 経路は自動化不可**: Web Bluetooth のペアリングダイアログは Playwright を通せないため、BLE 接続が必要な検証は手動テストをユーザーに依頼する
4. 完了報告時は「Playwright で検証済み / BLE 経路は未検証（手動確認お願いします）」を明示する

## 禁止事項

- `.env` / `.env.local` を直接編集しない（ユーザーに確認を取る）
- `js/config.js` を手動作成しない（`start-app.bat` が自動生成する）
- ユーザー入力を `innerHTML` に直接挿入しない

## 応答スタイル

- 端的・論理的・必要最低限
- 前置きと総括は省略。結論から書く
- コード変更後の自己解説は不要（差分が真実）
- 表・箇条書きを優先、散文は最小

## Claude Code ハーネス (.claude/)

- **[memory/](.claude/memory/)** — 自動メモリ（`MEMORY.md` がインデックス、topic ごとに分割）
- **[commands/](.claude/commands/)** — カスタムスラッシュコマンド（`/commit`, `/plan` 等）
- **[hooks/](.claude/hooks/)** — SessionStart（git 状態注入）/ PreToolUse（不可逆操作ガード）/ PostToolUse（Windows エンコーディング修正）
- **[settings.json](.claude/settings.json)** — 権限・hook 設定

## 共有ハーネス (.agent/)

`.agent/` 配下は他エージェント (Cline / Roo Code) 用の資産だが、**領域別ルールと計画は Claude Code からも参照する**。記憶は Claude Code 自動メモリ (`.claude/memory/`) に集約済み。

### 領域別ルール（該当領域の作業前に読む）

- [toio BLE](.agent/rules/toio-ble.md) — BLE 接続・コマンド送信のディレイ規約
- [Ollama / Gemini LLM](.agent/rules/ollama-llm.md) — LLM 連携・ツール呼び出し
- [UI / フロントエンド](.agent/rules/ui-frontend.md) — DOM・イベント・サニタイズ
- [UI デザイン規約](.agent/rules/design.md) — カラー・角丸・アニメーション（CSS 変更前に必読）
- [global](.agent/rules/global.md) — 他エージェント向け汎用規約（参考）

### その他

- **ワークフロー**: `.agent/workflows/` — 他エージェント用（Claude Code は `.claude/commands/` を使う）
- **計画**: `.agent/plans/` — 実装計画（`YYYY-MM-DD_<slug>.md`）。`/plan <slug>` で作成
- **タスク**: `.agent/tasks/` — チェックリスト

動作モードはグローバル `~/.claude/CLAUDE.md` 参照（書き込み前承認なし、git コミット規約 等）。
