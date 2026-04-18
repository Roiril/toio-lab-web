# .gitignoreの更新計画

現在の `.gitignore` には `node_modules` や一般的な不要ファイルが含まれていないため、これらを追加してリポジトリの管理を適切に行えるようにします。

## 変更内容

### [MODIFY] [.gitignore](file:///c:/Users/kouga/Projects/Web/toio-lab-web/.gitignore)

以下のカテゴリのパスを追加します：
- **依存関係**: `node_modules/`
- **ログファイル**: `*.log`, `npm-debug.log*` 等
- **OS固有ファイル**: `.DS_Store`, `Thumbs.db` 等
- **エディタ/IDE設定**: `.vscode/`, `.idea/` 等
- **環境変数**: `.env` 関連のパターン（既に `.env.local` は含まれています）

## 具体的な追加リスト

```gitignore
# Dependency directories
node_modules/
jspm_packages/

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# OS-specific files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Editor/IDE settings
.vscode/
.idea/
*.swp
*.swo

# Local env files
.env
.env.development.local
.env.test.local
.env.production.local
.env.local
```

## 検証プラン

### 手動確認
1. `git status` を実行し、`node_modules` などのディレクトリが追跡対象外となっていることを確認します。
