import express from 'express';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_URL = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
// A style id from the engine's /speakers
const SPEAKER = process.env.VOICEVOX_SPEAKER || '8';
const CACHE_DIR =
  process.env.TTS_CACHE_DIR || path.join(__dirname, '../tts-cache');

// Well over any sentence in a game, as anything sent here takes the engine's
// time and a place in the cache
const MAX_TEXT_LENGTH = 500;

export const ttsRouter = express.Router();

async function engineFetch(url, options) {
  const res = await fetch(`${ENGINE_URL}${url}`, {
    signal: AbortSignal.timeout(30 * 1000),
    ...options,
  });
  if (!res.ok) throw new Error(`VOICEVOX ${url} returned ${res.status}`);
  return res;
}

async function synthesize(text) {
  const params = new URLSearchParams({ text, speaker: SPEAKER });
  const query = await engineFetch(`/audio_query?${params}`, { method: 'POST' });
  const audio = await engineFetch(`/synthesis?speaker=${SPEAKER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await query.text(),
  });
  return Buffer.from(await audio.arrayBuffer());
}

// Whether the engine is up, and the credit its terms ask for wherever its
// audio is used: the name of the character speaking
ttsRouter.get('/voice', async (_req, res) => {
  try {
    const speakers = await (
      await engineFetch('/speakers', { signal: AbortSignal.timeout(2000) })
    ).json();
    const speaker = speakers.find(({ styles }) =>
      styles.some(({ id }) => String(id) === SPEAKER),
    );
    if (!speaker) {
      console.error(`VOICEVOX has no style ${SPEAKER}`);
      return res.status(503).json({ error: 'Voice not found' });
    }
    res.json({ credit: `VOICEVOX:${speaker.name}` });
  } catch {
    // Speech is optional, so the engine not running is not an error to log
    res.status(503).json({ error: 'VOICEVOX is not running' });
  }
});

ttsRouter.get('/', async (req, res) => {
  try {
    const { text } = req.query;
    if (!text || typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: 'Invalid text' });
    }

    const key = createHash('sha256')
      .update(`${SPEAKER}\0${text}`)
      .digest('hex');
    const filename = `${key}.wav`;
    const filePath = path.join(CACHE_DIR, filename);
    const cached = await fs.access(filePath).then(
      () => true,
      () => false,
    );
    if (!cached) {
      const audio = await synthesize(text);
      await fs.mkdir(CACHE_DIR, { recursive: true });
      // Renamed into place, so a crash or a request for the same text can't
      // leave or serve part of a file
      const partial = `${filePath}.${randomUUID()}`;
      await fs.writeFile(partial, audio);
      await fs.rename(partial, filePath);
    }
    // sendFile answers the range requests that browsers make for audio
    res.sendFile(filename, { root: CACHE_DIR });
  } catch (err) {
    console.error('Error synthesizing speech:', err);
    res.status(502).json({ error: 'Failed to synthesize speech' });
  }
});
