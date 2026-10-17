import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Resolve a game filename inside DATA_DIR, rejecting anything that could
// escape it (e.g. "..%2F.env" decodes to "../.env")
function gamePath(filename) {
  if (path.basename(filename) !== filename || !filename.endsWith('.json')) {
    return null;
  }
  return path.join(DATA_DIR, filename);
}

export const gamesRouter = express.Router();

// List all games
gamesRouter.get('/', async (_req, res) => {
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
          sentenceCount: game.sentences?.length || 0,
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
    const filePath = gamePath(req.params.filename);
    if (!filePath) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
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

    if (
      typeof game?.name !== 'string' ||
      !game.name ||
      !Array.isArray(game.sentences)
    ) {
      return res
        .status(400)
        .json({ error: 'Game must have name and sentences' });
    }

    // Generate filename: datetime_game-name.json
    const now = new Date();
    const dateStr = now
      .toISOString()
      .slice(0, 16)
      .replace('T', '_')
      .replace(':', '');
    const safeName = game.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 50);

    // Add createdAt if not present
    if (!game.createdAt) {
      game.createdAt = now.toISOString();
    }

    // Names without Latin letters (e.g. Japanese) all reduce to the same
    // safeName, so never overwrite: add a counter until the name is free
    const content = JSON.stringify(game, null, 2);
    let filename = `${dateStr}_${safeName}.json`;
    for (let n = 2; ; n++) {
      try {
        await fs.writeFile(path.join(DATA_DIR, filename), content, {
          flag: 'wx',
        });
        break;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        filename = `${dateStr}_${safeName}-${n}.json`;
      }
    }
    res.json({ filename, success: true });
  } catch (err) {
    console.error('Error saving game:', err);
    res.status(500).json({ error: 'Failed to save game' });
  }
});

// Delete a game
gamesRouter.delete('/:filename', async (req, res) => {
  try {
    const filePath = gamePath(req.params.filename);
    if (!filePath) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
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
