import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { gamesRouter } from './routes/games.js';
import { claudeRouter } from './routes/claude.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/games', gamesRouter);
app.use('/api', claudeRouter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
