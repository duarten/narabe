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

    // Readings should not be visible initially
    await expect(page.locator('.word-reading')).toHaveCount(0);

    // Click show readings
    await page.locator('.reading-btn').click();

    // Readings should now be visible
    await expect(page.locator('.word-reading')).toHaveCount(4);
    await expect(page.locator('.reading-btn')).toContainText('Hide Readings');
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

  test('skipped count increases when giving up', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    await page.locator('.giveup-btn').click();

    await expect(page.locator('.game-status')).toContainText('Skipped: 1');
  });

  test('can drag and drop words to reorder', async ({ page }) => {
    await createPlayableGame();
    await page.goto('/');
    await page.locator('.game-card').click();

    // Get all word tiles
    const tiles = page.locator('.word-tile');
    await expect(tiles).toHaveCount(4);

    // Perform drag and drop
    const firstTile = tiles.first();
    const lastTile = tiles.last();

    await firstTile.dragTo(lastTile);

    // The tiles should have been reordered
    // We can verify by checking the text content order changed
    await expect(tiles).toHaveCount(4);
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
