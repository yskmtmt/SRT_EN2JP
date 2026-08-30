# SRT EN → JP

英語SRT字幕ファイルの行番号・タイムコード・空行構成を完全維持したまま、Gemini APIを用いて自然な会話調の日本語字幕に翻訳するWebアプリです（Vercel対応）。

## 主な機能

- **SRT構造保護**: 行番号・タイムコード・空行位置を崩さず、英文字幕行のみを抽出して翻訳・置換
- **字幕特化の翻訳ルール**: 前後の文脈を考慮し、「自然な会話調」「呼称・口調の統一」「字幕らしい簡潔さ」を重視したGeminiプロンプト設計
- **モデル選択**: `gemini-2.5-flash`（推奨・標準）、`gemini-2.5-pro`、`gemini-3.7-flash`、`gemini-3.5-flash-lite` から選択可能
- **厳密な整合性検証**: 出力前に元ファイルと行単位で比較検証し、構造に狂いがない場合のみSRTダウンロード（UTF-8）を許可
- **消費推定トークン数表示 & AI Studioリンク**: 処理ごとの消費トークン数を可視化し、無料枠の残量確認（Google AI Studio）リンクを配置

## Vercelへのデプロイ手順

1. このリポジトリをVercelへImportします（Framework Presetは `Other` でOK）。
2. Vercelの **Settings → Environment Variables** に `GEMINI_API_KEY` を追加します（Google AI Studioで取得したAPIキー）。
3. （任意）デフォルトモデルを変更したい場合は `GEMINI_MODEL`（例: `gemini-2.5-flash`）を設定します。
4. Deployします。

※ APIキーはクライアント（ブラウザ）へは一切渡されず、サーバーサイドの `/api/translate` 経由でのみ安全にGemini APIと通信します。

## 翻訳の仕組み

1. ブラウザ側でSRTファイルを解析し、英文字幕行を24行単位のバッチに分割します。
2. `/api/translate` 経由でGemini APIのStructured Outputs（JSON Schema）を用いて翻訳を取得します。
3. サーバーとブラウザの双方で、行番号の対応・改行の非混入・行数の一致を二重に検証します。
4. バッチ失敗時は最大3回自動リトライし、それでも解決しない場合は該当行を原文のまま安全に保持します。
5. 翻訳完了後、画面上で自由に手動修正でき、整合性が確認され次第 `.srt` ファイルとしてダウンロードできます。

