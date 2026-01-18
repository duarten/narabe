import { createSignal, createMemo, Show } from 'solid-js';
import SentenceBoard from './SentenceBoard';

function GamePlayer(props) {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [correctCount, setCorrectCount] = createSignal(0);
  const [skippedCount, setSkippedCount] = createSignal(0);
  const [sentenceState, setSentenceState] = createSignal('playing'); // 'playing' | 'correct' | 'skipped'
  const [showReadings, setShowReadings] = createSignal(false);
  const [showMeanings, setShowMeanings] = createSignal(false);
  const [showGrammar, setShowGrammar] = createSignal(false);

  const currentSentence = createMemo(() => {
    if (!props.game?.sentences) return null;
    return props.game.sentences[currentIndex()];
  });

  const isGameComplete = createMemo(() => {
    if (!props.game?.sentences) return false;
    return currentIndex() >= props.game.sentences.length;
  });

  const handleCorrect = () => {
    setSentenceState('correct');
    setCorrectCount(c => c + 1);
  };

  const handleGiveUp = () => {
    setSentenceState('skipped');
    setSkippedCount(c => c + 1);
  };

  const handleNext = () => {
    setCurrentIndex(i => i + 1);
    setSentenceState('playing');
    setShowReadings(false);
    setShowMeanings(false);
    setShowGrammar(false);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setCorrectCount(0);
    setSkippedCount(0);
    setSentenceState('playing');
    setShowReadings(false);
    setShowMeanings(false);
    setShowGrammar(false);
  };

  return (
    <div class="game-player">
      <button class="back-btn" onClick={props.onBack}>
        ← Back to Games
      </button>

      <h2>{props.game?.name}</h2>

      <Show when={!isGameComplete()}>
        <div class="game-status">
          <span>Sentence {currentIndex() + 1} / {props.game?.sentences?.length}</span>
          <span class="score">
            Correct: {correctCount()} | Skipped: {skippedCount()}
          </span>
        </div>

        <Show when={currentSentence()}>
          <SentenceBoard
            sentence={currentSentence()}
            state={sentenceState()}
            showReadings={showReadings()}
            showMeanings={showMeanings()}
            onCorrect={handleCorrect}
          />

          <div class="controls">
            <Show when={sentenceState() === 'playing'}>
              <button
                class="reading-btn"
                onClick={() => setShowReadings(!showReadings())}
              >
                {showReadings() ? 'Hide Readings' : 'Show Readings'}
              </button>
              <button
                class="meaning-btn"
                onClick={() => setShowMeanings(!showMeanings())}
              >
                {showMeanings() ? 'Hide Meanings' : 'Show Meanings'}
              </button>
              <button class="giveup-btn" onClick={handleGiveUp}>
                Give Up
              </button>
            </Show>

            <Show when={sentenceState() !== 'playing'}>
              <button
                class="grammar-btn"
                onClick={() => setShowGrammar(!showGrammar())}
              >
                {showGrammar() ? 'Hide Grammar' : 'Show Grammar'}
              </button>
              <button class="next-btn" onClick={handleNext}>
                Next Sentence →
              </button>
            </Show>
          </div>

          <Show when={showGrammar() && currentSentence()?.grammarBreakdown}>
            <div class="grammar-breakdown">
              <h4>Grammar Breakdown</h4>
              <p>{currentSentence().grammarBreakdown}</p>
            </div>
          </Show>
        </Show>
      </Show>

      <Show when={isGameComplete()}>
        <div class="game-complete">
          <h3>Game Complete!</h3>
          <div class="final-score">
            <div class="score-item correct">
              <span class="label">Correct</span>
              <span class="value">{correctCount()}</span>
            </div>
            <div class="score-item skipped">
              <span class="label">Skipped</span>
              <span class="value">{skippedCount()}</span>
            </div>
            <div class="score-item total">
              <span class="label">Total</span>
              <span class="value">{props.game?.sentences?.length}</span>
            </div>
          </div>
          <div class="complete-actions">
            <button class="restart-btn" onClick={handleRestart}>
              Play Again
            </button>
            <button class="back-btn" onClick={props.onBack}>
              Back to Games
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

export default GamePlayer;
