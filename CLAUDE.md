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

## 禁止事項

- `.env` / `.env.local` を直接編集しない（ユーザーに確認を取る）
- `js/config.js` を手動作成しない（`start-app.bat` が自動生成する）
- ユーザー入力を `innerHTML` に直接挿入しない

## 応答スタイル

- 端的・論理的・必要最低限
- 前置きと総括は省略。結論から書く
- コード変更後の自己解説は不要（差分が真実）
- 表・箇条書きを優先、散文は最小

## 共有ハーネス (.agent/)

Claude Code をメインで使用するため、本プロジェクトの記憶は **Claude Code 自動メモリ** (`~/.claude/projects/.../memory/`) に集約する。`.agent/` 配下は他エージェント (Cline / Roo Code) 用の参照資産として残す。

- **ルール**: `.agent/rules/` — 他エージェント向け行動規約（Claude Code は読まない）
- **ワークフロー**: `.agent/workflows/` — 実装 / git-push / self-improve（同上）
- **計画**: `.agent/plans/` — 実装計画（`YYYY-MM-DD_<slug>.md`）。Claude Code も追記する
- **タスク**: `.agent/tasks/` — チェックリスト
- ~~**記憶**: `.agent/memory/`~~ — 撤去済み。今後は自動メモリへ

動作モードはグローバル `~/.claude/CLAUDE.md` 参照（書き込み前承認なし、git コミット規約 等）。
