import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

export const claudeRouter = express.Router();

const client = new Anthropic();

const SYSTEM_PROMPT = `You are helping with a Japanese language learning app. Given a Japanese sentence, you must:

1. Split the sentence into individual words and particles (particles should be separate)
2. Provide the reading in hiragana for each word (for words already in hiragana/katakana, use the same text)
3. Provide a brief English meaning for each word/particle
4. Write a brief grammar breakdown focusing on interesting or non-obvious grammatical points (skip basic explanations)

Respond ONLY with valid JSON in this exact format:
{
  "words": [
    { "word": "日本語の単語", "reading": "ひらがなのよみ", "meaning": "English meaning" }
  ],
  "grammarBreakdown": "Brief explanation of interesting grammar points..."
}`;

claudeRouter.post('/process-sentence', async (req, res) => {
  try {
    const { sentence } = req.body;

    if (!sentence || typeof sentence !== 'string') {
      return res.status(400).json({ error: 'Sentence is required' });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Sentence: ${sentence}`,
        },
      ],
    });

    const responseText = message.content[0].text;

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      // Try to extract JSON from the response if it contains extra text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid JSON response from Claude');
      }
    }

    res.json({
      original: sentence,
      words: parsed.words,
      grammarBreakdown: parsed.grammarBreakdown,
    });
  } catch (err) {
    console.error('Error processing sentence:', err);
    res
      .status(500)
      .json({ error: 'Failed to process sentence', details: err.message });
  }
});
