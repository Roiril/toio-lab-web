# Project Memory Index

> 個人情報・行動規約・汎用知識はグローバル正本（`~/.claude/memory/` = claude-global、行動規約は `~/.claude/rules/work-style.md`、研究テーマは `~/.claude/memory/research_robothand.md`）。ここにはこのプロジェクトの構造・経緯・固有知識のみ置く。

- [project_overview.md](project_overview.md) - スタック・主要ファイル・起動方法
- [harness_design.md](harness_design.md) - CLAUDE.md / .claude/ / .agent/ の役割分担と動作モード
- [feedback_response_style.md](feedback_response_style.md) - このプロジェクトでは端的・論理的・最低限、**敬語**で話す
- [feedback_estop_no_connect.md](feedback_estop_no_connect.md) - mycobot 緊急停止中はハードへの接続試行を一切しない。ソフト直して「接続OK」を待つ
- [project_agent_name_tom.md](project_agent_name_tom.md) - アプリ内LLM（Ollama/Gemini）の名前はトム
- [design_guidelines.md](design_guidelines.md) - UI/CSS 変更前に .agent/rules/design.md を必読（VSCode 風フラット設計）
- [mycobot_firmware_quirks.md](mycobot_firmware_quirks.md) - J5 latched lock（押下後は復旧不能・M5 再起動のみ）、get_servo_currents は torque を反映しない
