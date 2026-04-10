---
description: 変更をコミットしてリモートにプッシュするワークフロー
---

// turbo-all

# Git コミット & プッシュ ワークフロー

作業完了後、以下の手順でコミット・プッシュを行う。

## 1. 差分の確認

```bash
git status
git diff --stat
```

変更内容を確認し、意図しないファイルが含まれていないかチェックする。

## 2. ステージング

```bash
git add -A
```

特定ファイルのみの場合は `git add <path>` を使用する。

## 3. コミットメッセージの生成

`.agent/skills/git-commit.md` の規約に従い、変更内容を要約したタイトルを生成する。

**ルール**:
- `<type>: <subject>` フォーマットを使用
- Subject は変更の本質を簡潔に表す（日本語OK）
- 複数の責務がある場合はコミットを分割する

```bash
git commit -m "<type>: <subject>"
```

## 4. プッシュ

```bash
git push origin main
```

プッシュに失敗した場合:
- `rejected` → `git pull --rebase origin main` してから再プッシュ
- 認証エラー → ユーザーに認証設定を確認するよう依頼

## 5. 完了報告

コミットハッシュとプッシュ結果をユーザーに報告する。
