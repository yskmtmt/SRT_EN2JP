const MAX_ITEMS = 24;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite'
]);

const json = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'POSTリクエストのみ利用できます。' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 503, { error: 'GEMINI_API_KEYがVercelの環境変数に設定されていません。' });
  }

  const { items, model: requestedModel } = req.body || {};
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > MAX_ITEMS ||
    items.some(item => !Number.isInteger(item?.line) || typeof item?.text !== 'string' || item.text.length > 500)
  ) {
    return json(res, 400, { error: `翻訳データが不正です。1回に${MAX_ITEMS}行まで送信できます。` });
  }

  const selectedModel = (typeof requestedModel === 'string' && ALLOWED_MODELS.has(requestedModel))
    ? requestedModel
    : (process.env.GEMINI_MODEL || DEFAULT_MODEL);

  const instructions = [
    'あなたはプロの映像翻訳者です。英語のドラマ・映画・動画のSRT字幕行を、高品質で自然な日本語字幕に翻訳してください。',
    '【翻訳ルール】',
    '1. 映像字幕としての自然さを最優先し、直訳を避けて自然な会話調で翻訳してください。',
    '2. 複数の台詞の流れや前後の文脈を把握し、登場人物の一人称・二人称（呼称）や口調・語尾（敬体・常体）を首尾一貫させてください。',
    '3. 字幕として視聴者が瞬時に読めるよう、無駄な言葉を削ぎ落として簡潔で短くわかりやすい表現にしてください。',
    '4. 各入力字幕行に対して、改行（\\n や \\r）を含まない単一の日本語文字列として出力してください。',
    '5. <i>や<b>などのHTML風タグや記号はそのまま変更せずに保持してください。URLやクレジット表記（名前のみなど）は無理に日本語化せず適切に維持してください。',
    '6. 提供されたJSON内の全字幕行を正確に1対1で対応させ、元の line 番号をそのまま保持して指定のJSONスキーマ形式で返してください。'
  ].join('\n');

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: JSON.stringify({ subtitles: items }) }]
      }
    ],
    systemInstruction: {
      parts: [{ text: instructions }]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['translations'],
        properties: {
          translations: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['line', 'text'],
              properties: {
                line: { type: 'INTEGER' },
                text: { type: 'STRING' }
              }
            }
          }
        }
      },
      temperature: 0.3
    }
  };

  try {
    const upstream = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const errorMsg = data?.error?.message || `Gemini APIエラー（ステータス: ${upstream.status}）`;
      return json(res, upstream.status, { error: errorMsg });
    }

    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return json(res, 502, { error: 'Geminiから有効な翻訳テキストが返されませんでした。' });
    }

    let parsed;
    try {
      parsed = JSON.parse(candidateText);
    } catch {
      return json(res, 502, { error: 'AIから読み取れない翻訳結果が返されました。' });
    }

    const expected = new Set(items.map(item => item.line));
    const received = parsed?.translations;

    if (
      !Array.isArray(received) ||
      received.length !== expected.size ||
      received.some(item => !expected.has(item?.line) || typeof item?.text !== 'string' || /[\r\n]/.test(item.text))
    ) {
      return json(res, 502, { error: 'AI翻訳結果の行対応または形式を検証できませんでした。' });
    }

    return json(res, 200, {
      translations: received,
      usage: data.usageMetadata || null,
      model: selectedModel
    });
  } catch (error) {
    return json(res, 502, { error: `AI翻訳サービスへの通信でエラーが発生しました: ${error.message || error}` });
  }
};
