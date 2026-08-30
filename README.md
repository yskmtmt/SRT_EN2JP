# SRT EN → JP

英語SRTの字幕行だけを、行番号・タイムコード・空行構成を保ったまま日本語に翻訳するVercel向けWebアプリです。

## Vercelへの設定

1. このリポジトリをVercelへImportします。Framework Presetは`Other`のままで構いません。
2. Vercelの **Settings → Environment Variables** に `OPENAI_API_KEY` を追加します。値はOpenAI APIのプロジェクト用キーです。
3. 任意で `OPENAI_MODEL` を設定します。未設定なら `gpt-4.1-mini` を使います。
4. Deployします。

APIキーはブラウザに渡されず、Vercelの `/api/translate` だけで使用されます。

## 翻訳の仕組み

- 24字幕行ずつをJSONでLLMに送信し、同じ行番号の日本語をJSONで受信します。
- LLMには前後の台詞をまとめて渡すため、呼称・話し方・会話の流れを考慮できます。
- サーバーとブラウザの両方で、全行が一対一に戻ったこと・改行が混入していないことを検査します。
- 各バッチは最大3回再試行し、失敗時には該当行の範囲とAPIエラーを画面に表示します。
