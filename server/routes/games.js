import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', process.env.DATA_DIR || 'data');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

export const gamesRouter = express.Router();

// List all games
gamesRouter.get('/', async (req, res) => {
  try {
    await ensureDataDir();
    const files = await fs.readdir(DATA_DIR);
    const games = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
        const game = JSON.parse(content);
        games.push({
          filename: file,
          name: game.name,
          createdAt: game.createdAt,
          sentenceCount: game.sentences?.length || 0
        });
      } catch (err) {
        console.error(`Error reading game file ${file}:`, err);
      }
    }

    // Sort by date, newest first
    games.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(games);
  } catch (err) {
    console.error('Error listing games:', err);
    res.status(500).json({ error: 'Failed to list games' });
  }
});

// Get a specific game
gamesRouter.get('/:filename', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, req.params.filename);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Game not found' });
    } else {
      console.error('Error reading game:', err);
      res.status(500).json({ error: 'Failed to read game' });
    }
  }
});

// Save a new game
gamesRouter.post('/', async (req, res) => {
  try {
    await ensureDataDir();
    const game = req.body;

    if (!game.name || !game.sentences) {
      return res.status(400).json({ error: 'Game must have name and sentences' });
    }

    // Generate filename: datetime_game-name.json
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const safeName = game.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    const filename = `${dateStr}_${safeName}.json`;

    // Add createdAt if not present
    if (!game.createdAt) {
      game.createdAt = now.toISOString();
    }

    await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(game, null, 2));
    res.json({ filename, success: true });
  } catch (err) {
    console.error('Error saving game:', err);
    res.status(500).json({ error: 'Failed to save game' });
  }
});

// Delete a game
gamesRouter.delete('/:filename', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, req.params.filename);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Game not found' });
    } else {
      console.error('Error deleting game:', err);
      res.status(500).json({ error: 'Failed to delete game' });
    }
  }
});
