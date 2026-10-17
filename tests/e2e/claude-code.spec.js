import { test, expect } from '@playwright/test';

// A server on the claude-code backend, which runs tests/fixtures/fake-claude.js
// in place of Claude Code (see playwright.config.js)
const PROCESS_URL = 'http://localhost:3006/api/process-sentence';

test.describe('Claude Code backend', () => {
  test('processes a sentence with Claude Code', async ({ request }) => {
    const res = await request.post(PROCESS_URL, {
      data: { sentence: '私は学生です' },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.original).toBe('私は学生です');
    expect(body.words).toEqual([
      { word: '私は学生です', reading: 'よみ', meaning: 'test' },
    ]);

    // Run headless with the sentence schema and no tools, and without the API
    // key, which Claude Code would use instead of its own login
    const { args, apiKey } = JSON.parse(body.grammarBreakdown);
    const option = (name) => args[args.indexOf(name) + 1];
    expect(args).toContain('--print');
    expect(option('--output-format')).toBe('json');
    expect(JSON.parse(option('--json-schema')).required).toEqual([
      'words',
      'grammarBreakdown',
    ]);
    expect(option('--tools')).toBe('');
    expect(args).toContain('--safe-mode');
    expect(args).toContain('--no-session-persistence');
    expect(apiKey).toBeNull();
  });

  test('reports the error Claude Code gives', async ({ request }) => {
    const res = await request.post(PROCESS_URL, {
      data: { sentence: 'not logged in' },
    });
    expect(res.status()).toBe(500);
    expect((await res.json()).details).toBe(
      'Not logged in · Please run /login',
    );
  });

  test('reports Claude Code failing without a result', async ({ request }) => {
    const res = await request.post(PROCESS_URL, {
      data: { sentence: 'crash' },
    });
    expect(res.status()).toBe(500);
    expect((await res.json()).details).toBe('Something broke');
  });
});
