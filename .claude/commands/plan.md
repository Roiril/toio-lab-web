---
description: 新規の実装計画ファイルを .agent/plans/ に作成
argument-hint: <slug-kebab-case> [タイトル]
allowed-tools: Bash(date:*), Write, Read
---

`.agent/plans/YYYY-MM-DD_<slug>.md` を作成する。

## 手順

1. システムコンテキストの `currentDate` または `date +%Y-%m-%d` で今日の日付を取得
2. `$ARGUMENTS` の先頭トークンを slug として採用（kebab-case に整形）。日本語が含まれる場合はユーザーに英語 slug を提案して確認
3. 残りのトークンをタイトルとして使用。未指定なら slug をタイトル化
4. 対象ファイルが既存なら上書きせず、ユーザーに上書き可否を確認
5. 以下のテンプレートで作成：

```markdown
---
status: in-progress
created: YYYY-MM-DD
updated: YYYY-MM-DD
slug: <slug>
---

# <タイトル>

## 概要

<1-3 行で目的と背景>

## フェーズ

### Phase 1: <名前>

- [ ] <タスク>

## 自律改善ログ

(作業中に気付いた改善点や学びをここに追記)
```

6. 作成後、相対パスをユーザーに報告

## 備考

- SessionStart hook が `status: in-progress` の計画を自動で拾ってセッション開始時に表示する
- 完了時は frontmatter を `status: done` に更新（削除はしない、履歴として残す）

引数: $ARGUMENTS
