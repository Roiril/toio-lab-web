# toio Lab Web - Gemma4 Controller

ブラウザからローカルLLM (Ollama + Gemma4) を呼び出し、自然言語でtoioコアキューブを操作するWebアプリケーションです。

## 概要
- **自然言語操作**: 「前に進んで」「赤く光って！」等のチャット入力でロボット（toio）を動かせます。
- **Gemma4 Tool Calling**: Ollama経由でGemma4のFunction Calling機能を活用し、言語モデル自身が最適なハードウェアAPIを選択します。
- **Web Bluetooth API**: ブラウザから直接toioにペアリングし、遅延のない操作が可能です。

## 必要要件
- **Ollama**: [インストール・起動](https://ollama.com/) してください。
- **モデル**: `gemma4:4b-it` (推奨) を事前に `$ ollama run gemma4:4b-it` 等でPULLしておいてください。より大きなモデルを使用する場合は、Web UI設定から変更できます。
- **ブラウザ**: Chrome または Edge (Web Bluetooth API対応必須)。

## Ollama の CORS 設定
ブラウザのJavaScriptから直接OllamaのREST APIを叩くため、CORSの設定が必要です。

### Windows の場合 (PowerShell)
```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

### Mac / Linux の場合
```bash
OLLAMA_ORIGINS="*" ollama serve
```

## 起動方法
ビルドツールは不要です。単にディレクトリをローカルサーバーでホストしてください。

```bash
# Node.jsがインストールされている場合
npx serve .
```
その後、ブラウザで `http://localhost:3000` (または表示されたURL) にアクセスします。

## 操作手順
1. 左側パネルの **「Connect Cube」** ボタンを押し、Bluetoothペアリングで toio キューブを選択します。
2. Ollamaのステータスが `Ready` になっていることを確認します（Errorの場合は設定画面からURLを確認し、OllamaのCORS設定を見直してください）。
3. チャットボックスに「少し後ろに下がって、青く光らせて」等と入力して送信します。
4. Gemma4が思考し、toioを動かすためのツール群を呼び出す様子が確認できます。

## システム構成
- `js/toio-ble.js`: Web Bluetooth API のラッパー
- `js/ollama-client.js`: Ollama REST API クライアント
- `js/tools-schema.js`: Gemma4へのツール定義 (JSON Schema)
- `js/tool-executor.js`: ToolCall と BLE通信 の結合レイヤー
- `js/app.js`: UIと状態管理
