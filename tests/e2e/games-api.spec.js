import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'server', 'data-test');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Ignore if exists
  }
}

async function clearGames() {
  await ensureDataDir();
  try {
    const files = await fs.readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await fs.unlink(path.join(DATA_DIR, file));
      }
    }
  } catch (err) {
    // Directory might not exist
  }
}

test.describe('Games API', () => {
  test.beforeEach(async () => {
    await clearGames();
  });

  test.afterAll(async () => {
    await clearGames();
  });

  test('rejects filenames outside the data directory', async ({ request }) => {
    // A file next to the data directory, which "..%2F" would reach
    const sentinel = path.join(DATA_DIR, '..', 'traversal-sentinel.json');
    await fs.writeFile(sentinel, '{}');
    try {
      const target = `/api/games/${encodeURIComponent('../traversal-sentinel.json')}`;
      expect((await request.get(target)).status()).toBe(400);
      expect((await request.delete(target)).status()).toBe(400);
      await expect(fs.access(sentinel)).resolves.toBeUndefined();
    } finally {
      await fs.rm(sentinel, { force: true });
    }
  });

  test('does not overwrite games whose names reduce to the same filename', async ({
    request,
  }) => {
    for (const name of ['日本語の練習', '日本語の復習']) {
      const res = await request.post('/api/games', {
        data: { name, sentences: [] },
      });
      expect(res.ok()).toBe(true);
    }

    const games = await (await request.get('/api/games')).json();
    expect(games.map((g) => g.name).sort()).toEqual(
      ['日本語の練習', '日本語の復習'].sort(),
    );
  });

  test('saves games larger than the default body limit', async ({
    request,
  }) => {
    const sentence = {
      original: '私は学生です',
      words: [{ word: '私', reading: 'わたし', meaning: 'I' }],
      grammarBreakdown: 'x'.repeat(2500),
    };
    const res = await request.post('/api/games', {
      data: { name: 'Big Game', sentences: Array(60).fill(sentence) },
    });
    expect(res.ok()).toBe(true);
  });

  test('rejects a game without a name', async ({ request }) => {
    const res = await request.post('/api/games', {
      data: { sentences: [] },
    });
    expect(res.status()).toBe(400);
  });
});
