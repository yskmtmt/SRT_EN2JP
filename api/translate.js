const MAX_ITEMS = 60;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
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

  const { items, model: requestedModel, ignoreContext } = req.body || {};
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > MAX_ITEMS ||
    items.some(item => !Number.isInteger(item?.line) || typeof item?.text !== 'string' || item.text.length > 1000)
  ) {
    return json(res, 400, { error: `翻訳データが不正です。1回に${MAX_ITEMS}行まで送信できます。` });
  }

  const selectedModel = (typeof requestedModel === 'string' && ALLOWED_MODELS.has(requestedModel))
    ? requestedModel
    : (process.env.GEMINI_MODEL || DEFAULT_MODEL);

  const contextSpecificRules = ignoreContext
    ? [
        '2. 【口調・ジェンダー表現の重要規則】',
        '   - 「〜だわ」「〜かしら」「〜のよ」といった古風・過剰な女性語、および「〜ぜ」「〜ぞ」「〜だろ」といった乱暴・漫画的な男性語（いわゆるステレオタイプな役割語）はどちらも使用しないでください。',
        '   - その字幕行に含まれる人名、代名詞（he/she/him/her）、呼称（man/sir/ma\'am/lady等）から話者の性別や関係性を推測してください。',
        '   - 話者の性別が明確に特定できない場合は、男女どちらが発しても自然に聞こえる「中立的で自然な現代口語」（例：「〜かな」「〜だよ」「〜ね」「〜だ」「〜なんだ」「〜じゃない？」「〜して」など）を基本としてください。',
        '3. 【重要：独立翻訳】前後の行や文脈を推測・参照せず、各字幕行をそれぞれ完全に独立したものとして翻訳してください。前後の台詞に引きずられた意訳や事実関係の勝手な補完・変更を禁止し、その字幕行自体の原文の意味に忠実に翻訳してください。'
      ]
    : [
        '2. 【口調・ジェンダー表現の重要規則】',
        '   - 「〜だわ」「〜かしら」「〜のよ」といった古風・過剰な女性語、および「〜ぜ」「〜ぞ」「〜だろ」といった乱暴・漫画的な男性語（いわゆるステレオタイプな役割語）はどちらも使用しないでください。',
        '   - 人名、代名詞（he/she/him/her）、呼称（man/sir/ma\'am/lady等）から前後の文脈で話者の性別や関係性を注意深く推測してください。',
        '   - 話者の性別が明確に特定できない場合は、男女どちらが発しても自然に聞こえる「中立的で自然な現代口語」（例：「〜かな」「〜だよ」「〜ね」「〜だ」「〜なんだ」「〜じゃない？」「〜して」など）を基本としてください。',
        '3. 複数の台詞の流れや前後の文脈を把握し、登場人物の一人称・二人称や口調・語尾（敬体・常体）が会話の途中で不自然にブレないよう首尾一貫させてください。'
      ];

  const instructions = [
    'あなたはプロの映像翻訳者です。英語のドラマ・映画・動画のSRT字幕行を、高品質で自然な日本語字幕に翻訳してください。',
    '【翻訳ルール】',
    '1. 映像字幕としての自然さを最優先し、直訳を避けて自然な会話調で翻訳してください。',
    ...contextSpecificRules,
    '4. 字幕として視聴者が瞬時に読めるよう、無駄な言葉を削ぎ落として簡潔で短くわかりやすい表現にしてください。',
    '5. 各入力字幕行に対して、改行文字（\\n や \\r）を絶対に入れず、1行の文字列として出力してください。',
    '6. 登場人物の名前や固有名詞はカタカナ等の適切な日本語表記にし、すべての字幕行をもれなく日本語に翻訳してください（英語のまま放置しないでください）。<i>や<b>などのHTML風タグや記号はそのまま保持してください。',
    '7. 提供されたJSON内の全字幕行を正確に1対1で対応させ、元の line 番号をそのまま保持して指定のJSONスキーマ形式で返してください。'
  ].join('\n');

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;


  const generationConfig = {
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
  };

  // Thinking（思考機能）対応モデルの場合、思考バジェットを0にして思考遅延を排除し、翻訳生成速度を最大化
  if (
    selectedModel.includes('2.5') ||
    selectedModel.includes('3.7') ||
    selectedModel.includes('thinking')
  ) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

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
    generationConfig
  };

  try {
    const upstream = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const errorMsg = data?.error?.message || `Gemini APIエラー（HTTP ${upstream.status}）`;
      return json(res, upstream.status, { error: errorMsg });
    }

    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return json(res, 502, { error: 'Geminiから翻訳テキストが返されませんでした。' });
    }

    let parsed;
    try {
      parsed = JSON.parse(candidateText);
    } catch {
      return json(res, 502, { error: 'AIから読み取れないJSON形式の翻訳結果が返されました。' });
    }

    const expected = new Set(items.map(item => item.line));
    const rawList = Array.isArray(parsed?.translations) ? parsed.translations : [];
    const validMap = new Map();

    for (const item of rawList) {
      if (item && expected.has(item.line) && typeof item.text === 'string') {
        // 改行が含まれていた場合はスペースに置換してサニタイズ
        const sanitized = item.text.replace(/[\r\n]+/g, ' ').trim();
        validMap.set(item.line, sanitized);
      }
    }

    if (validMap.size === 0) {
      return json(res, 502, { error: '有効な字幕翻訳データを受信できませんでした。' });
    }

    const validTranslations = Array.from(validMap.entries()).map(([line, text]) => ({ line, text }));

    return json(res, 200, {
      translations: validTranslations,
      usage: data.usageMetadata || null,
      model: selectedModel
    });
  } catch (error) {
    return json(res, 502, { error: `AI翻訳サービスへの通信でエラーが発生しました: ${error.message || error}` });
  }
};

module.exports.config = {
  maxDuration: 60
};
