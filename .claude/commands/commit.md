---
description: staged 変更をプロジェクトの日本語コミット規約でコミット
argument-hint: [追加コンテキスト]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git commit:*), Bash(git add:*)
---

ステージ済みの変更を、グローバル `~/.claude/CLAUDE.md` の日本語コミット規約に従ってコミットする。

## 規約（再掲）

```
<type>：<日本語の要約>
```

- **type**: `feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` / `perf` / `build` / `ci`
- **区切り文字**: 全角コロン `：`
- **要約**: 日本語で 1 行 50 文字以内目安
- 大規模変更時は空行を挟んで本文（箇条書き可）

## 手順

1. `git status --short` と `git diff --cached` で変更内容を確認
2. `git log --oneline -10` で直近の慣習を把握（既存リポジトリ慣習を優先）
3. type と要約を決定。複数目的が混在する場合はユーザーに分割可否を確認
4. HEREDOC でコミット：
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>：<要約>
   
   <任意の本文>
   EOF
   )"
   ```
5. `git status` で結果確認

## 注意

- ステージされた変更がなければコミットせず報告
- `.env` / 認証情報がステージに含まれていたら警告
- ユーザーが明示的に要求しない限り `--no-verify` や `--amend` は使わない
- Co-Authored-By 行はこのプロジェクトでは付与しない（既存コミットに倣う）

追加コンテキスト: $ARGUMENTS
