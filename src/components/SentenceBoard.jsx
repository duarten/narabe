import {
  createSignal,
  createEffect,
  createMemo,
  createResource,
  For,
  Show,
  batch,
  onCleanup,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { loadReadingLists, rubyRuns } from '../lib/furigana';

// How far a pressed tile has to move before it's being dragged
const DRAG_THRESHOLD = 4;
const SLIDE = { duration: 200, easing: 'ease-out' };

const moveItem = (array, from, to) => {
  const result = [...array];
  result.splice(to, 0, ...result.splice(from, 1));
  return result;
};

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The font draws the readings itself; .word-text turns them off with ss01
// until they're asked for
function WordContent(props) {
  // A salted span's font-feature-settings replaces the parent's ss01, so
  // only split out salted runs while readings are shown
  const runs = createMemo(() =>
    props.showReadings
      ? rubyRuns(props.word.word, props.word.reading, props.readingLists)
      : [{ text: props.word.word }],
  );

  return (
    <>
      <span
        class="word-text"
        classList={{ 'show-readings': props.showReadings }}
      >
        <For each={runs()}>
          {(run) =>
            run.salt ? (
              <span style={{ 'font-feature-settings': `"salt" ${run.salt}` }}>
                {run.text}
              </span>
            ) : (
              run.text
            )
          }
        </For>
      </span>
      <Show when={props.showMeanings}>
        <span class="word-meaning">{props.word.meaning}</span>
      </Show>
    </>
  );
}

function SentenceBoard(props) {
  const [wordOrder, setWordOrder] = createSignal([]);
  const [shuffledSentence, setShuffledSentence] = createSignal(null);
  const [readingLists] = createResource(loadReadingLists);
  // While a word is dragged, the tiles show the order it would make, which
  // only becomes the word order when it's dropped
  const [dragId, setDragId] = createSignal(null);
  const [dragOrder, setDragOrder] = createSignal(null);
  const [pointer, setPointer] = createSignal({ x: 0, y: 0 });

  let container;
  let overlay;
  const tiles = new Map();
  // The pointer pressing a tile, and where on the tile it pressed
  let press = null;
  let grab = { x: 0, y: 0 };

  // The sentence the word order was made for, which props.sentence can run
  // ahead of until the effect below catches up
  const words = () => shuffledSentence()?.words ?? [];

  // Fisher-Yates shuffle, ensuring we don't end up with a visually correct order
  const shuffleIndices = (words) => {
    const indices = Array.from({ length: words.length }, (_, i) => i);

    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Keep shuffling until we get an order that's not visually correct
    // (comparing word text so duplicate words are treated as interchangeable)
    let shuffled = shuffle([...indices]);
    let attempts = 0;
    while (
      shuffled.every((val, idx) => words[val].word === words[idx].word) &&
      words.length > 1 &&
      attempts < 10
    ) {
      shuffled = shuffle([...indices]);
      attempts++;
    }

    return shuffled;
  };

  // Shuffle words when sentence changes. Compared by identity rather than
  // text, so a sentence repeated in a game is shuffled again too
  createEffect(() => {
    const sentence = props.sentence;
    if (sentence?.words && sentence !== shuffledSentence()) {
      batch(() => {
        cancelDrag();
        setShuffledSentence(sentence);
        setWordOrder(shuffleIndices(sentence.words));
      });
    }
  });

  // Reset to correct order when skipped
  createEffect(() => {
    if (props.state === 'skipped' && props.sentence?.words) {
      batch(() => {
        cancelDrag();
        setWordOrder(props.sentence.words.map((_, i) => i));
      });
    }
  });

  const isCorrect = createMemo(() => {
    if (!props.sentence?.words) return false;
    // Only check correctness if word order belongs to the current sentence
    if (props.sentence !== shuffledSentence()) return false;
    const order = wordOrder();
    if (order.length !== props.sentence.words.length) return false;
    return order.every(
      (val, idx) =>
        props.sentence.words[val].word === props.sentence.words[idx].word,
    );
  });

  // Auto-detect correct answer
  createEffect(() => {
    if (isCorrect() && props.state === 'playing') {
      props.onCorrect();
    }
  });

  const slideOf = (tile) =>
    tile.getAnimations().find((animation) => animation.id === 'slide');

  // Reorders the tiles, sliding each from where it was shown, even partway
  // through a slide, to where it now is
  const slideTiles = (reorder) => {
    const before = new Map(
      [...tiles].map(([id, tile]) => [id, tile.getBoundingClientRect()]),
    );
    reorder();
    if (reducedMotion()) return;
    for (const [id, tile] of tiles) {
      slideOf(tile)?.cancel();
      const from = before.get(id);
      const to = tile.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (dx || dy) {
        tile.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { ...SLIDE, id: 'slide' },
        );
      }
    }
  };

  // Where the dragged word goes for a pointer at (x, y): before or after the
  // word nearest the pointer in its row, by which half of that word it's
  // over. Uses offsets rather than the tiles' rects so a sliding tile counts
  // as already in its place, and moving one doesn't move the targets around.
  const dropIndex = (order, x, y) => {
    const from = order.indexOf(dragId());
    const origin = container.getBoundingClientRect();
    const left = origin.left + container.clientLeft;
    const top = origin.top + container.clientTop;
    let nearest = null;
    order.forEach((id, index) => {
      const tile = tiles.get(id);
      const tileTop = top + tile.offsetTop;
      if (y < tileTop || y > tileTop + tile.offsetHeight) return;
      const tileLeft = left + tile.offsetLeft;
      const distance = Math.max(
        tileLeft - x,
        x - (tileLeft + tile.offsetWidth),
        0,
      );
      if (!nearest || distance < nearest.distance) {
        nearest = { index, distance, center: tileLeft + tile.offsetWidth / 2 };
      }
    });
    if (!nearest || nearest.index === from) return from;
    const to = x < nearest.center ? nearest.index : nearest.index + 1;
    return from < to ? to - 1 : to;
  };

  const onPointerDown = (event, id) => {
    if (event.button !== 0 || press || dragId() !== null) return;
    if (props.state !== 'playing') return;
    // No text selection or native drag while pressing a tile
    event.preventDefault();
    const rect = tiles.get(id).getBoundingClientRect();
    press = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  const onPointerMove = (event) => {
    if (event.pointerId !== press.pointerId) return;
    const starting = dragId() === null;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (starting && moved < DRAG_THRESHOLD) return;
    batch(() => {
      setPointer({ x: event.clientX, y: event.clientY });
      if (starting) {
        setDragOrder(wordOrder());
        setDragId(press.id);
      }
    });

    const order = dragOrder();
    const from = order.indexOf(press.id);
    const to = dropIndex(order, event.clientX, event.clientY);
    if (to !== from) slideTiles(() => setDragOrder(moveItem(order, from, to)));
  };

  const stopListening = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    press = null;
  };
  onCleanup(stopListening);

  // Drops the dragged word where the tiles show it, settling it into its
  // place before the tile there shows it
  const onPointerUp = (event) => {
    if (event.pointerId !== press.pointerId) return;
    stopListening();
    const id = dragId();
    if (id === null) return;

    batch(() => {
      setWordOrder(dragOrder());
      setDragOrder(null);
    });
    const tile = tiles.get(id);
    if (reducedMotion() || !tile) {
      setDragId(null);
      return;
    }
    slideOf(tile)?.cancel();
    const to = tile.getBoundingClientRect();
    overlay.animate([{ translate: `${to.left}px ${to.top}px`, scale: 1 }], {
      duration: 150,
      easing: 'ease-out',
    }).onfinish = () => {
      // Unless the next sentence came up meanwhile and a drag began on it
      if (dragOrder() === null) setDragId(null);
    };
  };

  // The browser took the pointer over, e.g. for a gesture: put the word back
  const onPointerCancel = (event) => {
    if (event.pointerId === press.pointerId) cancelDrag();
  };

  function cancelDrag() {
    stopListening();
    batch(() => {
      setDragOrder(null);
      setDragId(null);
    });
  }

  return (
    <div
      class="sentence-board"
      classList={{
        correct: props.state === 'correct',
        skipped: props.state === 'skipped',
      }}
    >
      <div
        ref={container}
        class="words-container"
        classList={{
          playable: props.state === 'playing',
          sorting: dragOrder() !== null,
        }}
      >
        <For each={dragOrder() ?? wordOrder()}>
          {(id) => {
            onCleanup(() => tiles.delete(id));
            return (
              <div
                ref={(tile) => tiles.set(id, tile)}
                class="word-tile"
                classList={{
                  placeholder: dragId() === id,
                  'with-hints': props.showReadings || props.showMeanings,
                }}
                onPointerDown={(event) => onPointerDown(event, id)}
              >
                <WordContent
                  word={words()[id]}
                  showReadings={props.showReadings}
                  showMeanings={props.showMeanings}
                  readingLists={readingLists()}
                />
              </div>
            );
          }}
        </For>
      </div>

      <Show when={dragId() !== null && words()[dragId()]}>
        <Portal>
          <div
            ref={overlay}
            class="word-tile drag-overlay"
            style={{
              // The translate property, unlike transform, isn't scaled by
              // the overlay's scale
              translate: `${pointer().x - grab.x}px ${pointer().y - grab.y}px`,
            }}
          >
            <WordContent
              word={words()[dragId()]}
              showReadings={props.showReadings}
              showMeanings={props.showMeanings}
              readingLists={readingLists()}
            />
          </div>
        </Portal>
      </Show>

      <Show when={props.state === 'correct'}>
        <div class="result-message correct">Correct!</div>
      </Show>

      <Show when={props.state === 'skipped'}>
        <div class="result-message skipped">
          The correct order is shown above
        </div>
      </Show>
    </div>
  );
}

export default SentenceBoard;
