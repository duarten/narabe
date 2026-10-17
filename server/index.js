import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { gamesRouter } from './routes/games.js';
import { claudeRouter, BACKEND } from './routes/claude.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Processed games run ~2.5KB per sentence; the 100KB default would reject
// saving a game of ~40 sentences after they were all processed
app.use(express.json({ limit: '5mb' }));

// API routes
app.use('/api/games', gamesRouter);
app.use('/api', claudeRouter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
}

// Claude Code runs as its logged-in user (e.g. on their subscription), so
// only serve this machine rather than anyone who can reach it
const HOST = BACKEND === 'claude-code' ? '127.0.0.1' : undefined;

app.listen(PORT, HOST, () => {
  console.log(
    `Server running on http://localhost:${PORT}, processing sentences with ${BACKEND === 'claude-code' ? 'Claude Code' : 'the Claude API'}`,
  );
});
