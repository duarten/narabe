import { createSignal, Show, For } from 'solid-js';
import { processSentences, saveGame } from '../lib/api';

function GameCreator(props) {
  const [gameName, setGameName] = createSignal('');
  const [sentences, setSentences] = createSignal('');
  const [processing, setProcessing] = createSignal(false);
  const [progress, setProgress] = createSignal({ completed: 0, total: 0 });
  const [processedSentences, setProcessedSentences] = createSignal([]);
  const [error, setError] = createSignal(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const name = gameName().trim();
    const sentenceList = sentences()
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!name) {
      setError('Please enter a game name');
      return;
    }

    if (sentenceList.length === 0) {
      setError('Please enter at least one sentence');
      return;
    }

    setProcessing(true);
    setProgress({ completed: 0, total: sentenceList.length });
    setProcessedSentences([]);

    try {
      const results = await processSentences(
        sentenceList,
        4,
        (completed, total, index, result) => {
          setProgress({ completed, total });
          setProcessedSentences((prev) => {
            const newArr = [...prev];
            newArr[index] = result;
            return newArr;
          });
        },
      );

      // Check if any sentences had errors
      const failedCount = results.filter((r) => r.error).length;
      if (failedCount > 0) {
        setError(
          `${failedCount} sentence(s) failed to process. Please check your API key and try again.`,
        );
        setProcessing(false);
        return;
      }

      // Save the game
      const game = {
        name,
        sentences: results,
      };

      await saveGame(game);
      props.onGameCreated();
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  return (
    <div class="game-creator">
      <button class="back-btn" onClick={props.onBack}>
        ← Back
      </button>

      <h2>Create New Game</h2>

      <Show when={!processing()}>
        <form onSubmit={handleSubmit}>
          <div class="form-group">
            <label for="game-name">Game Name</label>
            <input
              id="game-name"
              type="text"
              value={gameName()}
              onInput={(e) => setGameName(e.target.value)}
              placeholder="e.g., JLPT N5 Practice"
            />
          </div>

          <div class="form-group">
            <label for="sentences">Japanese Sentences (one per line)</label>
            <textarea
              id="sentences"
              value={sentences()}
              onInput={(e) => setSentences(e.target.value)}
              placeholder="私は学生です。&#10;今日は天気がいいです。&#10;日本語を勉強しています。"
              rows="10"
            />
          </div>

          <Show when={error()}>
            <div class="error-message">{error()}</div>
          </Show>

          <button type="submit" class="submit-btn">
            Process & Save Game
          </button>
        </form>
      </Show>

      <Show when={processing()}>
        <div class="processing">
          <div class="progress-bar">
            <div
              class="progress-fill"
              style={{
                width: `${(progress().completed / progress().total) * 100}%`,
              }}
            />
          </div>
          <p>
            Processing sentences: {progress().completed} / {progress().total}
          </p>

          <div class="processed-list">
            <For each={processedSentences()}>
              {(sentence) => (
                <Show when={sentence}>
                  <div class="processed-item">
                    <span class="original">{sentence.original}</span>
                    <span class="status">{sentence.error ? '❌' : '✓'}</span>
                  </div>
                </Show>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default GameCreator;
