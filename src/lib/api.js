const API_BASE = '/api';

export async function fetchGames() {
  const res = await fetch(`${API_BASE}/games`);
  if (!res.ok) throw new Error('Failed to fetch games');
  return res.json();
}

export async function fetchGame(filename) {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(filename)}`);
  if (!res.ok) throw new Error('Failed to fetch game');
  return res.json();
}

export async function saveGame(game) {
  const res = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(game),
  });
  if (!res.ok) throw new Error('Failed to save game');
  return res.json();
}

export async function deleteGame(filename) {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete game');
  return res.json();
}

export async function processSentence(sentence) {
  const res = await fetch(`${API_BASE}/process-sentence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to process sentence');
  }
  return res.json();
}

// Process multiple sentences with concurrency limit
export async function processSentences(sentences, concurrency = 4, onProgress) {
  const results = new Array(sentences.length);
  let completed = 0;
  let currentIndex = 0;

  async function processNext() {
    while (currentIndex < sentences.length) {
      const index = currentIndex++;
      const sentence = sentences[index];

      try {
        results[index] = await processSentence(sentence);
      } catch (err) {
        results[index] = {
          original: sentence,
          error: err.message,
          words: [],
          grammarBreakdown: 'Error processing sentence',
        };
      }

      completed++;
      if (onProgress) {
        onProgress(completed, sentences.length, index, results[index]);
      }
    }
  }

  // Start concurrent workers
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, sentences.length); i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);
  return results;
}
