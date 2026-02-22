import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'server', 'data-test');

// Helper to ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    // Ignore if exists
  }
}

// Helper to clear test games
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

// Helper to create a test game
async function createTestGame(name, sentences) {
  await ensureDataDir();
  const game = {
    name,
    createdAt: new Date().toISOString(),
    sentences: sentences.map((s) => ({
      original: s,
      words: [{ word: s, reading: s, meaning: 'test' }],
      grammarBreakdown: 'Test grammar',
    })),
  };
  const dateStr = new Date()
    .toISOString()
    .slice(0, 16)
    .replace('T', '_')
    .replace(':', '');
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `${dateStr}_${safeName}.json`;
  await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(game));
  return filename;
}

test.describe('Game List', () => {
  test.beforeEach(async () => {
    await clearGames();
  });

  test.afterAll(async () => {
    await clearGames();
  });

  test('shows welcome message when no games exist', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.welcome h2')).toContainText(
      'Welcome to Narabe!',
    );
    await expect(page.locator('.create-btn')).toBeVisible();
    await expect(page.locator('.create-btn')).toContainText('Create New Game');
  });

  test('displays games when they exist', async ({ page }) => {
    await createTestGame('Test Game 1', ['私は学生です']);
    await createTestGame('Test Game 2', ['今日は天気がいい', '日本語']);

    await page.goto('/');

    await expect(page.locator('.game-card')).toHaveCount(2);
    await expect(page.locator('.game-card h3').first()).toContainText(
      'Test Game',
    );
  });

  test('shows sentence count for each game', async ({ page }) => {
    await createTestGame('Multi Sentence Game', ['文1', '文2', '文3']);

    await page.goto('/');

    await expect(page.locator('.game-meta')).toContainText('3 sentences');
  });

  test('can delete a game with confirmation', async ({ page }) => {
    await createTestGame('Game to Delete', ['削除する文']);

    await page.goto('/');

    // First click shows confirmation
    await page.locator('.delete-btn').click();
    await expect(page.locator('.delete-btn')).toContainText('Confirm?');

    // Second click deletes
    await page.locator('.delete-btn').click();

    // Wait for game to be removed
    await expect(page.locator('.game-card')).toHaveCount(0);
    await expect(page.locator('.welcome')).toBeVisible();
  });

  test('navigates to create game screen', async ({ page }) => {
    await page.goto('/');

    await page.locator('.create-btn').click();

    await expect(page.locator('.game-creator h2')).toContainText(
      'Create New Game',
    );
    await expect(page.locator('#game-name')).toBeVisible();
    await expect(page.locator('#sentences')).toBeVisible();
  });

  test('can go back to list from create screen', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-btn').click();

    await page.locator('.back-btn').click();

    await expect(page.locator('.welcome')).toBeVisible();
  });
});
