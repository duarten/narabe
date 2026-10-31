import {
  createSignal,
  createMemo,
  createResource,
  Show,
  batch,
  onCleanup,
} from 'solid-js';
import SentenceBoard from './SentenceBoard';
import GrammarText from './GrammarText';
import { fetchVoice } from '../lib/api';
import { speak, stopSpeaking } from '../lib/speech';

function GamePlayer(props) {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [correctCount, setCorrectCount] = createSignal(0);
  const [skippedCount, setSkippedCount] = createSignal(0);
  const [sentenceState, setSentenceState] = createSignal('playing'); // 'playing' | 'correct' | 'skipped'
  const [showReadings, setShowReadings] = createSignal(false);
  const [showMeanings, setShowMeanings] = createSignal(false);
  const [showGrammar, setShowGrammar] = createSignal(false);
  const [voice] = createResource(fetchVoice);
  const [speechFailed, setSpeechFailed] = createSignal(false);

  onCleanup(stopSpeaking);

  const say = (text) => {
    setSpeechFailed(false);
    speak(text).catch((err) => {
      console.error('Failed to play speech:', err);
      setSpeechFailed(true);
    });
  };

  const stopSaying = () => {
    stopSpeaking();
    setSpeechFailed(false);
  };

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
    setCorrectCount((c) => c + 1);
  };

  const handleGiveUp = () => {
    setSentenceState('skipped');
    setSkippedCount((c) => c + 1);
  };

  // Batched so the board never sees the next sentence while the state is
  // still 'skipped', which would reveal its correct order
  const handleNext = () =>
    batch(() => {
      stopSaying();
      setCurrentIndex((i) => i + 1);
      setSentenceState('playing');
      setShowReadings(false);
      setShowMeanings(false);
      setShowGrammar(false);
    });

  const handleRestart = () =>
    batch(() => {
      stopSaying();
      setCurrentIndex(0);
      setCorrectCount(0);
      setSkippedCount(0);
      setSentenceState('playing');
      setShowReadings(false);
      setShowMeanings(false);
      setShowGrammar(false);
    });

  return (
    <div class="game-player">
      <button class="back-btn" onClick={props.onBack}>
        ← Back to Games
      </button>

      <h2>{props.game?.name}</h2>

      <Show when={!isGameComplete()}>
        <div class="game-status">
          <span>
            Sentence {currentIndex() + 1} / {props.game?.sentences?.length}
          </span>
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
            onTapWord={voice() ? (word) => say(word.word) : undefined}
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
              {/* Only now, as hearing the sentence would give away its order */}
              <Show when={voice()}>
                <button
                  class="listen-btn"
                  onClick={() => say(currentSentence().original)}
                >
                  Play Sentence
                </button>
              </Show>
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

          <Show when={voice()}>
            <p class="voice-note">
              <Show when={sentenceState() === 'playing'}>
                Tap a word to hear it ·{' '}
              </Show>
              {voice().credit}
            </p>
            <Show when={speechFailed()}>
              <p class="voice-error">Couldn't play the audio</p>
            </Show>
          </Show>

          <Show when={showGrammar() && currentSentence()?.grammarBreakdown}>
            <div class="grammar-breakdown">
              <h4>Grammar Breakdown</h4>
              <GrammarText text={currentSentence().grammarBreakdown} />
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
