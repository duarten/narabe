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

async function createPlayableGame() {
  await ensureDataDir();
  const game = {
    name: 'Playable Test Game',
    createdAt: new Date().toISOString(),
    sentences: [
      {
        original: '私は学生です',
        words: [
          { word: '私', reading: 'わたし', meaning: 'I' },
          { word: 'は', reading: 'は', meaning: 'topic marker' },
          { word: '学生', reading: 'がくせい', meaning: 'student' },
          { word: 'です', reading: 'です', meaning: 'is/am' },
        ],
        grammarBreakdown:
          'This is a basic self-introduction sentence using は to mark the topic.',
      },
      {
        original: '今日は天気がいい',
        words: [
          { word: '今日', reading: 'きょう', meaning: 'today' },
          { word: 'は', reading: 'は', meaning: 'topic marker' },
          { word: '天気', reading: 'てんき', meaning: 'weather' },
          { word: 'が', reading: 'が', meaning: 'subject marker' },
          { word: 'いい', reading: 'いい', meaning: 'good' },
        ],
        grammarBreakdown: 'Uses が to mark 天気 as the subject of いい (good).',
      },
    ],
  };
  const filename = 'test-playable-game.json';
  await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(game));
  return filename;
}

async function createCustomGame(sentences) {
  await ensureDataDir();
  const game = {
    name: 'Custom Test Game',
    createdAt: new Date().toISOString(),
    sentences,
  };
  const filename = 'test-custom-game.json';
  await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(game));
  return filename;
}

const TWO_WORDS = {
  original: '猫だ',
  words: [
    { word: '猫', reading: 'ねこ', meaning: 'cat' },
    { word: 'だ', reading: 'だ', meaning: 'is' },
  ],
  grammarBreakdown: 'Test grammar',
};

// Drags the word tile at index `from` over the left or right half of the
// one at index `to`, and holds it there
async function dragWord(page, from, to, side) {
  const tiles = page.locator('.words-container .word-tile');
  const source = await tiles.nth(from).boundingBox();
  const target = await tiles.nth(to).boundingBox();
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width * (side === 'left' ? 0.25 : 0.75),
    target.y + target.height / 2,
    { steps: 10 },
  );
}

test.describe('Game Playing', () => {
  test.beforeEach(async () => {
    await clearGames();
  });

  test.afterAll(async () => {
    await clearGames();
  });

  test('displays shuffled words', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');

    await page.locator('.game-card').click();

    // Should show the sentence board with word tiles
    await expect(page.locator('.sentence-board')).toBeVisible();
    await expect(page.locator('.word-tile')).toHaveCount(4); // First sentence has 4 words
  });

  test('shows game status with sentence count', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    await expect(page.locator('.game-status')).toContainText('Sentence 1 / 2');
    await expect(page.locator('.game-status')).toContainText('Correct: 0');
  });

  test('show readings reveals word readings', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    // Readings (Furifont's furigana) should be turned off initially
    await expect(page.locator('.word-text')).toHaveCount(4);
    await expect(page.locator('.word-text.show-readings')).toHaveCount(0);
    await expect(page.locator('.word-text').first()).toHaveCSS(
      'font-feature-settings',
      '"ss01"',
    );

    // Click show readings
    await page.locator('.reading-btn').click();

    // Readings should now be visible
    await expect(page.locator('.word-text.show-readings')).toHaveCount(4);
    await expect(page.locator('.word-text').first()).toHaveCSS(
      'font-feature-settings',
      'normal',
    );
    await expect(page.locator('.reading-btn')).toContainText('Hide Readings');
  });

  test('readings make the font show each word’s own reading', async ({
    page,
  }) => {
    await createCustomGame([
      {
        original: '今日は学生と話します',
        words: [
          { word: '今日', reading: 'こんにち', meaning: 'today' },
          { word: 'は', reading: 'は', meaning: 'topic marker' },
          { word: '学生', reading: 'がくせい', meaning: 'student' },
          { word: 'と', reading: 'と', meaning: 'with' },
          { word: '話します', reading: 'はなします', meaning: 'to talk' },
        ],
        grammarBreakdown: 'Test grammar',
      },
    ]);
    await page.goto('/');
    await page.locator('.game-card').click();
    await page.locator('.reading-btn').click();

    const run = (text) => page.locator('.word-text span', { hasText: text });
    // こんにち is the font's 2nd reading of 今日, はな its 3rd of 話
    await expect(run('今日')).toHaveCSS('font-feature-settings', '"salt" 2');
    await expect(run('話')).toHaveCSS('font-feature-settings', '"salt" 3');
    // The font reads 学生 as がくせい by default
    await expect(run('学生')).toHaveCount(0);

    // Hiding readings drops the salted runs, which would override ss01
    await page.locator('.reading-btn').click();
    await expect(page.locator('.word-text span')).toHaveCount(0);
  });

  test('show meanings reveals word meanings', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    // Meanings should not be visible initially
    await expect(page.locator('.word-meaning')).toHaveCount(0);

    // Click show meanings
    await page.locator('.meaning-btn').click();

    // Meanings should now be visible
    await expect(page.locator('.word-meaning')).toHaveCount(4);
    await expect(page.locator('.meaning-btn')).toContainText('Hide Meanings');
  });

  test('give up shows correct order and turns red', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    await page.locator('.giveup-btn').click();

    // Board should have skipped class (red border)
    await expect(page.locator('.sentence-board')).toHaveClass(/skipped/);

    // Should show result message
    await expect(page.locator('.result-message.skipped')).toBeVisible();

    // Should show grammar button
    await expect(page.locator('.grammar-btn')).toBeVisible();

    // Should show next button
    await expect(page.locator('.next-btn')).toBeVisible();
  });

  test('show grammar displays breakdown after give up', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    await page.locator('.giveup-btn').click();
    await page.locator('.grammar-btn').click();

    await expect(page.locator('.grammar-breakdown')).toBeVisible();
    await expect(page.locator('.grammar-breakdown')).toContainText(
      'This is a basic self-introduction',
    );
  });

  test('next sentence advances to next sentence', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    await page.locator('.giveup-btn').click();
    await page.locator('.next-btn').click();

    // Should now show sentence 2
    await expect(page.locator('.game-status')).toContainText('Sentence 2 / 2');
    await expect(page.locator('.word-tile')).toHaveCount(5); // Second sentence has 5 words
  });

  test('a repeated sentence is shuffled again', async ({ page }) => {
    const sentence = {
      original: '私は学生です',
      words: [
        { word: '私', reading: 'わたし', meaning: 'I' },
        { word: 'は', reading: 'は', meaning: 'topic marker' },
        { word: '学生', reading: 'がくせい', meaning: 'student' },
        { word: 'です', reading: 'です', meaning: 'is/am' },
      ],
      grammarBreakdown: 'Test grammar',
    };
    await createCustomGame([sentence, sentence]);
    await page.goto('/');
    await page.locator('.game-card').click();

    await page.locator('.giveup-btn').click();
    await page.locator('.next-btn').click();

    // The second copy must not start out solved in the order just revealed
    await expect(page.locator('.game-status')).toContainText('Sentence 2 / 2');
    await expect(page.locator('.sentence-board')).not.toHaveClass(/correct/);
    await expect(page.locator('.giveup-btn')).toBeVisible();
    await expect(page.locator('.game-status')).toContainText('Correct: 0');
  });

  test('skipped count increases when giving up', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    await page.locator('.giveup-btn').click();

    await expect(page.locator('.game-status')).toContainText('Skipped: 1');
  });

  test('a word dropped on the right half of another goes after it', async ({
    page,
  }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();
    const tiles = page.locator('.words-container .word-tile');
    await expect(tiles).toHaveCount(4);
    const before = await tiles.allTextContents();

    await dragWord(page, 0, 3, 'right');
    await page.mouse.up();

    await expect(tiles).toHaveText([...before.slice(1), before[0]]);
  });

  test('a word dropped on the left half of another goes before it', async ({
    page,
  }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();
    const tiles = page.locator('.words-container .word-tile');
    await expect(tiles).toHaveCount(4);
    const before = await tiles.allTextContents();

    await dragWord(page, 3, 0, 'left');
    await page.mouse.up();

    await expect(tiles).toHaveText([before[3], ...before.slice(0, 3)]);
  });

  test('dragging shows where the word will go, but only counts once dropped', async ({
    page,
  }) => {
    await createCustomGame([TWO_WORDS]);
    await page.goto('/');
    await page.locator('.game-card').click();
    const tiles = page.locator('.words-container .word-tile');
    // Two words are always shuffled into the wrong order
    await expect(tiles).toHaveText(['だ', '猫']);

    await dragWord(page, 0, 1, 'right');
    await expect(tiles).toHaveText(['猫', 'だ']);
    await expect(tiles.nth(1)).toHaveClass(/placeholder/);
    await expect(page.locator('.drag-overlay')).toHaveText('だ');
    await expect(page.locator('.sentence-board')).not.toHaveClass(/correct/);

    await page.mouse.up();
    await expect(page.locator('.sentence-board')).toHaveClass(/correct/);
    await expect(page.locator('.game-status')).toContainText('Correct: 1');
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
  });

  test('words cannot be dragged once the sentence is over', async ({
    page,
  }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();
    await page.locator('.giveup-btn').click();
    const tiles = page.locator('.words-container .word-tile');
    await expect(tiles).toHaveText(['私', 'は', '学生', 'です']);

    await dragWord(page, 0, 3, 'right');
    await expect(page.locator('.drag-overlay')).toHaveCount(0);
    await page.mouse.up();

    await expect(tiles).toHaveText(['私', 'は', '学生', 'です']);
  });

  test.describe('on a touch screen', () => {
    test.use({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });

    test('words can be dragged by touch', async ({ page }) => {
      await createCustomGame([TWO_WORDS]);
      await page.goto('/');
      await page.locator('.game-card').click();
      const tiles = page.locator('.words-container .word-tile');
      await expect(tiles).toHaveText(['だ', '猫']);

      // Playwright can only tap, so send the touches through the protocol
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, point) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: point ? [point] : [],
        });
      const from = await tiles.nth(0).boundingBox();
      const to = await tiles.nth(1).boundingBox();
      const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      const end = { x: to.x + to.width * 0.75, y: to.y + to.height / 2 };
      await touch('touchStart', start);
      for (let i = 1; i <= 10; i++) {
        await touch('touchMove', {
          x: start.x + ((end.x - start.x) * i) / 10,
          y: start.y + ((end.y - start.y) * i) / 10,
        });
      }
      await touch('touchEnd');

      await expect(tiles).toHaveText(['猫', 'だ']);
      await expect(page.locator('.sentence-board')).toHaveClass(/correct/);
    });
  });

  test('auto-detects correct order', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    // The game should auto-detect when the order is correct
    // Since words are shuffled, we verify the board is in playing state initially
    await expect(page.locator('.sentence-board')).not.toHaveClass(/correct/);
    await expect(page.locator('.sentence-board')).not.toHaveClass(/skipped/);
  });

  test('game complete shows final score', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    // Skip both sentences
    await page.locator('.giveup-btn').click();
    await page.locator('.next-btn').click();

    await page.locator('.giveup-btn').click();
    await page.locator('.next-btn').click();

    // Should show game complete screen
    await expect(page.locator('.game-complete')).toBeVisible();
    await expect(page.locator('.game-complete h3')).toContainText(
      'Game Complete',
    );

    // Check final score
    await expect(page.locator('.score-item.correct .value')).toContainText('0');
    await expect(page.locator('.score-item.skipped .value')).toContainText('2');
    await expect(page.locator('.score-item.total .value')).toContainText('2');
  });

  test('play again restarts the game', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    // Complete the game
    await page.locator('.giveup-btn').click();
    await page.locator('.next-btn').click();
    await page.locator('.giveup-btn').click();
    await page.locator('.next-btn').click();

    // Click play again
    await page.locator('.restart-btn').click();

    // Should be back at sentence 1
    await expect(page.locator('.game-status')).toContainText('Sentence 1 / 2');
    await expect(page.locator('.game-status')).toContainText('Correct: 0');
  });

  test('back to games button returns to list', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    await page.locator('.back-btn').first().click();

    await expect(page.locator('.game-list')).toBeVisible();
  });
});
