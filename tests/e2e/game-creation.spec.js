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

test.describe('Game Creation', () => {
  test.beforeEach(async () => {
    await clearGames();
  });

  test.afterAll(async () => {
    await clearGames();
  });

  test('shows validation error for empty game name', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-btn').click();

    await page.locator('#sentences').fill('私は学生です');
    await page.locator('.submit-btn').click();

    await expect(page.locator('.error-message')).toContainText(
      'Please enter a game name',
    );
  });

  test('shows validation error for empty sentences', async ({ page }) => {
    await page.goto('/');
    await page.locator('.create-btn').click();

    await page.locator('#game-name').fill('Test Game');
    await page.locator('.submit-btn').click();

    await expect(page.locator('.error-message')).toContainText(
      'Please enter at least one sentence',
    );
  });

  test('processes sentences and shows progress', async ({ page }) => {
    // Mock the Claude API response
    await page.route('**/api/process-sentence', async (route) => {
      const body = JSON.parse(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          original: body.sentence,
          words: [
            {
              word: body.sentence.slice(0, 2),
              reading: body.sentence.slice(0, 2),
              meaning: 'word 1',
            },
            {
              word: body.sentence.slice(2),
              reading: body.sentence.slice(2),
              meaning: 'word 2',
            },
          ],
          grammarBreakdown: 'Test grammar breakdown',
        }),
      });
    });

    await page.goto('/');
    await page.locator('.create-btn').click();

    await page.locator('#game-name').fill('My Test Game');
    await page.locator('#sentences').fill('私は学生です\n今日は天気がいい');
    await page.locator('.submit-btn').click();

    // Wait for completion and redirect (processing may be too fast to catch UI)
    await expect(page.locator('.game-list')).toBeVisible({ timeout: 10000 });
  });

  test('newly created game appears in list', async ({ page }) => {
    await page.route('**/api/process-sentence', async (route) => {
      const body = JSON.parse(route.request().postData());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          original: body.sentence,
          words: [
            { word: body.sentence, reading: body.sentence, meaning: 'test' },
          ],
          grammarBreakdown: 'Grammar',
        }),
      });
    });

    await page.goto('/');
    await page.locator('.create-btn').click();

    await page.locator('#game-name').fill('Brand New Game');
    await page.locator('#sentences').fill('テスト文');
    await page.locator('.submit-btn').click();

    // Wait for redirect to game list
    await expect(page.locator('.game-list')).toBeVisible({ timeout: 10000 });

    // Check game appears
    await expect(page.locator('.game-card h3')).toContainText('Brand New Game');
    await expect(page.locator('.game-meta')).toContainText('1 sentences');
  });

  test('handles API errors gracefully', async ({ page }) => {
    await page.route('**/api/process-sentence', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'API Error' }),
      });
    });

    await page.goto('/');
    await page.locator('.create-btn').click();

    await page.locator('#game-name').fill('Error Test Game');
    await page.locator('#sentences').fill('テスト');
    await page.locator('.submit-btn').click();

    // Should show error message and not save the game
    await expect(page.locator('.error-message')).toContainText(
      'failed to process',
    );
    await expect(page.locator('.game-creator')).toBeVisible();
  });
});
