#!/usr/bin/env node
// Stands in for the Claude Code CLI: answers like `claude --print
// --output-format json` does, and reports how it was run in the grammar
// breakdown so tests can check it
import { text } from 'node:stream/consumers';

const sentence = (await text(process.stdin)).trim().replace(/^Sentence: /, '');

if (sentence === 'not logged in') {
  // Claude Code reports errors in its JSON result and exits non-zero
  console.log(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Not logged in · Please run /login',
    }),
  );
  process.exitCode = 1;
} else if (sentence === 'crash') {
  console.error('Something broke');
  process.exitCode = 2;
} else {
  console.log(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      stop_reason: 'tool_use',
      structured_output: {
        words: [{ word: sentence, reading: 'よみ', meaning: 'test' }],
        grammarBreakdown: JSON.stringify({
          args: process.argv.slice(2),
          apiKey: process.env.ANTHROPIC_API_KEY ?? null,
        }),
      },
    }),
  );
}
