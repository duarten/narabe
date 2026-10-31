import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

// tests/fixtures/fake-voicevox.js stands in for the engine behind the server on
// 3002, and the one on 3006 has no engine (see playwright.config.js)
const TTS_URL = 'http://localhost:3002/api/tts';
const NO_ENGINE_URL = 'http://localhost:3006/api/tts';
const ENGINE_URL = 'http://127.0.0.1:3008';

const DATA_DIR = path.join(process.cwd(), 'server', 'data-test');
const CACHE_DIR = path.join(process.cwd(), 'server', 'tts-cache-test');

async function clearGames() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const file of await fs.readdir(DATA_DIR)) {
    if (file.endsWith('.json')) await fs.unlink(path.join(DATA_DIR, file));
  }
}

async function createGame() {
  const word = (word) => ({ word, reading: word, meaning: 'test' });
  const game = {
    name: 'Speech Test Game',
    createdAt: new Date().toISOString(),
    sentences: [
      {
        original: '私は学生です',
        words: ['私', 'は', '学生', 'です'].map(word),
        grammarBreakdown: 'Test grammar',
      },
      {
        original: '猫だ',
        words: ['猫', 'だ'].map(word),
        grammarBreakdown: 'Test grammar',
      },
    ],
  };
  await fs.writeFile(
    path.join(DATA_DIR, 'test-speech-game.json'),
    JSON.stringify(game),
  );
}

// Records the text of each clip the page plays, and keeps the clips
async function spyOnAudio(page) {
  await page.addInitScript(() => {
    window.clips = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.clips.push(this);
      return play.call(this);
    };
  });
}

const playedTexts = (page) =>
  page.evaluate(() =>
    window.clips.map((clip) => new URL(clip.src).searchParams.get('text')),
  );

async function openGame(page) {
  await page.goto('/');
  await page.locator('.game-card').click();
  await expect(page.locator('.voice-note')).toBeVisible();
}

test.describe('Speech API', () => {
  test.beforeEach(async () => {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
  });

  test('credits the voice', async ({ request }) => {
    const res = await request.get(`${TTS_URL}/voice`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ credit: 'VOICEVOX:春日部つむぎ' });
  });

  test('synthesizes a clip once and then serves it from the cache', async ({
    request,
  }) => {
    const synthesized = async () =>
      (await (await request.get(`${ENGINE_URL}/synthesized`)).json())
        .synthesized;
    const before = await synthesized();
    const url = `${TTS_URL}?text=${encodeURIComponent('私は学生です')}`;

    const first = await request.get(url);
    expect(first.status()).toBe(200);
    expect(first.headers()['content-type']).toBe('audio/wav');
    expect((await first.body()).subarray(0, 4).toString()).toBe('RIFF');
    expect(await synthesized()).toBe(before + 1);

    const second = await request.get(url);
    expect(second.status()).toBe(200);
    expect(await second.body()).toEqual(await first.body());
    expect(await synthesized()).toBe(before + 1);
  });

  test('answers range requests', async ({ request }) => {
    const res = await request.get(`${TTS_URL}?text=abc`, {
      headers: { Range: 'bytes=0-3' },
    });
    expect(res.status()).toBe(206);
    expect((await res.body()).toString()).toBe('RIFF');
  });

  test('rejects missing and overlong text', async ({ request }) => {
    expect((await request.get(TTS_URL)).status()).toBe(400);
    expect(
      (await request.get(`${TTS_URL}?text=${'あ'.repeat(501)}`)).status(),
    ).toBe(400);
    expect((await request.get(`${TTS_URL}?text=a&text=b`)).status()).toBe(400);
  });

  test('reports an engine error and caches nothing', async ({ request }) => {
    const url = `${TTS_URL}?text=${encodeURIComponent('engine error')}`;
    expect((await request.get(url)).status()).toBe(502);
    await expect(fs.readdir(CACHE_DIR)).rejects.toThrow();
  });

  test('reports when the engine is not running', async ({ request }) => {
    expect((await request.get(`${NO_ENGINE_URL}/voice`)).status()).toBe(503);
    expect((await request.get(`${NO_ENGINE_URL}?text=abc`)).status()).toBe(502);
  });
});

test.describe('Speech in a game', () => {
  test.beforeEach(async ({ page }) => {
    await clearGames();
    await createGame();
    await spyOnAudio(page);
  });

  test.afterAll(clearGames);

  test('tapping a word plays it', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('.voice-note')).toContainText(
      'Tap a word to hear it',
    );
    await expect(page.locator('.voice-note')).toContainText(
      'VOICEVOX:春日部つむぎ',
    );

    const tile = page.locator('.word-tile').first();
    const word = await tile.locator('.word-text').textContent();
    await tile.click();

    expect(await playedTexts(page)).toEqual([word]);
    // Really played, rather than just asked to
    await expect
      .poll(() => page.evaluate(() => window.clips[0].currentTime))
      .toBeGreaterThan(0);
    await expect(page.locator('.voice-error')).toHaveCount(0);
  });

  test('tapping another word stops the one playing', async ({ page }) => {
    await openGame(page);
    await page.locator('.word-tile').first().click();
    await page.locator('.word-tile').nth(1).click();

    expect(await playedTexts(page)).toHaveLength(2);
    expect(await page.evaluate(() => window.clips[0].paused)).toBe(true);
    await expect(page.locator('.voice-error')).toHaveCount(0);
  });

  test('dragging a word does not play it', async ({ page }) => {
    await openGame(page);
    const tiles = page.locator('.word-tile');
    const source = await tiles.first().boundingBox();
    const target = await tiles.nth(1).boundingBox();
    await page.mouse.move(source.x + 5, source.y + 5);
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width - 5,
      target.y + target.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();

    expect(await playedTexts(page)).toEqual([]);
  });

  test('the sentence can only be played once it is over', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('.listen-btn')).toHaveCount(0);

    await page.locator('.giveup-btn').click();
    await page.locator('.listen-btn').click();

    expect(await playedTexts(page)).toEqual(['私は学生です']);
  });

  test('the next sentence stops the audio and hides the button', async ({
    page,
  }) => {
    await openGame(page);
    await page.locator('.giveup-btn').click();
    await page.locator('.listen-btn').click();
    await page.locator('.next-btn').click();

    expect(await page.evaluate(() => window.clips[0].paused)).toBe(true);
    await expect(page.locator('.listen-btn')).toHaveCount(0);
  });

  test('audio that fails to play says so', async ({ page }) => {
    await page.route('**/api/tts?*', (route) =>
      route.fulfill({ status: 502, body: '{}' }),
    );
    await openGame(page);
    await page.locator('.word-tile').first().click();

    await expect(page.locator('.voice-error')).toBeVisible();
  });

  test('without the engine there is no speech', async ({ page }) => {
    await page.route('**/api/tts/voice', (route) =>
      route.fulfill({ status: 503, body: '{}' }),
    );
    await page.goto('/');
    const voice = page.waitForResponse('**/api/tts/voice');
    await page.locator('.game-card').click();
    await voice;

    await page.locator('.word-tile').first().click();
    await page.locator('.giveup-btn').click();

    await expect(page.locator('.result-message')).toBeVisible();
    await expect(page.locator('.listen-btn')).toHaveCount(0);
    await expect(page.locator('.voice-note')).toHaveCount(0);
    expect(await playedTexts(page)).toEqual([]);
  });
});
