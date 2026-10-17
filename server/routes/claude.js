import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';

export const claudeRouter = express.Router();

// 'api' calls the Claude API with ANTHROPIC_API_KEY; 'claude-code' runs the
// local Claude Code CLI, as whatever account it's logged in with
export const BACKEND = process.env.CLAUDE_BACKEND || 'api';
if (!['api', 'claude-code'].includes(BACKEND)) {
  throw new Error(
    `Unknown CLAUDE_BACKEND "${BACKEND}" (expected "api" or "claude-code")`,
  );
}

const MODEL = 'claude-sonnet-5-5';

const SYSTEM_PROMPT = `You are helping with a Japanese language learning app. Given a Japanese sentence, you must:

1. Split the sentence into individual words and particles (particles should be separate)
2. Provide the reading in hiragana for each word (for words already in hiragana/katakana, use the same text)
3. Provide a brief English meaning for each word/particle
4. Write a brief grammar breakdown focusing on interesting or non-obvious grammatical points (skip basic explanations)`;

// Both backends constrain the response to this schema
const SENTENCE_SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          reading: { type: 'string' },
          meaning: { type: 'string' },
        },
        required: ['word', 'reading', 'meaning'],
        additionalProperties: false,
      },
    },
    grammarBreakdown: { type: 'string' },
  },
  required: ['words', 'grammarBreakdown'],
  additionalProperties: false,
};

const SENTENCE_FORMAT = betaJSONSchemaOutputFormat(SENTENCE_SCHEMA);

const client = BACKEND === 'api' ? new Anthropic() : null;

// Each backend returns the structured output, or null if Claude declined

async function processWithApi(sentence) {
  const message = await client.beta.messages.parse({
    model: MODEL,
    // Thinking counts toward max_tokens, so leave room beyond the JSON itself
    max_tokens: 16000,
    output_config: { effort: 'low', format: SENTENCE_FORMAT },
    // If the safety classifiers decline a request, retry it on the
    // recommended fallback model instead of failing
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Sentence: ${sentence}`,
      },
    ],
  });

  if (message.stop_reason === 'refusal') return null;
  if (!message.parsed_output) {
    throw new Error(`No structured output (stop: ${message.stop_reason})`);
  }
  return message.parsed_output;
}

const execFileAsync = promisify(execFile);

async function processWithClaudeCode(sentence) {
  // Claude Code prefers an API key in its environment to its own login, so
  // leave out the one .env may hold, or this would bill it like 'api' does
  const { ANTHROPIC_API_KEY, ...env } = process.env;
  const run = execFileAsync(
    process.env.CLAUDE_CODE_PATH || 'claude',
    [
      '--print',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(SENTENCE_SCHEMA),
      '--system-prompt',
      SYSTEM_PROMPT,
      '--model',
      MODEL,
      '--effort',
      'low',
      // Just a question and an answer: no tools, none of the user's
      // CLAUDE.md, hooks, MCP servers or plugins, and no saved session
      '--tools',
      '',
      '--safe-mode',
      '--no-session-persistence',
    ],
    { env, timeout: 3 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
  );
  // Through stdin, so a sentence can't be read as an option. Writing fails
  // when Claude Code couldn't start, which the run reports better
  run.child.stdin.on('error', () => {});
  run.child.stdin.end(`Sentence: ${sentence}`);

  let stdout;
  try {
    ({ stdout } = await run);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `Claude Code not found at "${err.path}"; install it or set CLAUDE_CODE_PATH`,
      );
    }
    if (err.killed) throw new Error('Claude Code timed out after 3 minutes');
    // It exits non-zero on errors such as not being logged in, but still
    // prints its JSON result saying why
    if (!err.stdout) {
      throw new Error(
        err.stderr.trim() ||
          `Claude Code exited with ${err.signal ?? `code ${err.code}`}`,
      );
    }
    stdout = err.stdout;
  }

  const result = JSON.parse(stdout);
  if (result.is_error) throw new Error(result.result);
  if (result.stop_reason === 'refusal') return null;
  if (!result.structured_output) {
    throw new Error(`No structured output (stop: ${result.stop_reason})`);
  }
  return result.structured_output;
}

const processSentence =
  BACKEND === 'claude-code' ? processWithClaudeCode : processWithApi;

claudeRouter.post('/process-sentence', async (req, res) => {
  try {
    const { sentence } = req.body ?? {};

    if (!sentence || typeof sentence !== 'string') {
      return res.status(400).json({ error: 'Sentence is required' });
    }

    const output = await processSentence(sentence);
    if (!output) {
      return res
        .status(422)
        .json({ error: 'Claude declined to process this sentence' });
    }

    res.json({
      original: sentence,
      words: output.words,
      grammarBreakdown: output.grammarBreakdown,
    });
  } catch (err) {
    console.error('Error processing sentence:', err);
    res
      .status(500)
      .json({ error: 'Failed to process sentence', details: err.message });
  }
});
