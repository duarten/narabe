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
            run.ruby ? (
              <ruby>
                {run.text}
                <rt>{run.ruby}</rt>
              </ruby>
            ) : run.salt ? (
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
  // While a word is dragged, the tiles stay in place and a bar shows where
  // it would go: before or after the target word. The word order only
  // changes when it's dropped.
  const [dragId, setDragId] = createSignal(null);
  const [target, setTarget] = createSignal(null);
  const [pointer, setPointer] = createSignal({ x: 0, y: 0 });
  // After a drop moves the tiles, the browser takes the pointer to be over
  // the word that was there before until it moves
  const [hoverStale, setHoverStale] = createSignal(false);

  let container;
  // The dragged word's copy, in two layers so the drop bar can go between
  // them: its tile, and its letters over it
  let copyTile;
  let copyLetters;
  const tiles = new Map();
  // The pointer pressing a tile, and where on the tile it pressed
  let press = null;
  let grab = { x: 0, y: 0 };
  // The dropped word's copy settling into its place, one animation a layer
  let settling = [];

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

  // Where a tile is in the viewport, by its offsets rather than its rect, so
  // a tile still sliding from the last drop counts as already in its place
  const placeOf = (tile) => {
    const origin = container.getBoundingClientRect();
    const left = origin.left + container.clientLeft + tile.offsetLeft;
    const top = origin.top + container.clientTop + tile.offsetTop;
    return {
      left,
      top,
      right: left + tile.offsetWidth,
      bottom: top + tile.offsetHeight,
    };
  };

  // Where the dragged word goes for a pointer at (x, y): before or after the
  // word nearest the pointer in its row, by which half of that word it's
  // over, or null over no row
  const dropTarget = (x, y) => {
    let nearest = null;
    for (const [id, tile] of tiles) {
      const place = placeOf(tile);
      if (y < place.top || y > place.bottom) continue;
      const distance = Math.max(place.left - x, x - place.right, 0);
      if (!nearest || distance < nearest.distance) {
        nearest = { id, distance, after: x >= (place.left + place.right) / 2 };
      }
    }
    return nearest && { id: nearest.id, after: nearest.after };
  };

  // The bar showing where the dragged word goes, in the gap on that side of
  // the target word. It's placed on the page, since in the board the app's
  // stacking context would keep it under the dragged word's copy, which is
  // usually over it, rather than between the copy's tile and letters.
  const dropBarStyle = ({ id, after }) => {
    const place = placeOf(tiles.get(id));
    const gap = parseFloat(getComputedStyle(container).columnGap);
    const x = after ? place.right + gap / 2 : place.left - gap / 2;
    return {
      left: `${window.scrollX + x}px`,
      top: `${window.scrollY + place.top}px`,
      height: `${place.bottom - place.top}px`,
    };
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
    const to = dropTarget(event.clientX, event.clientY);
    batch(() => {
      setPointer({ x: event.clientX, y: event.clientY });
      if (starting) setDragId(press.id);
      // Over no row, as between two rows, the bar stays where it was; over
      // the word's own tile it goes, as the word would stay put
      if (to) setTarget(to.id === press.id ? null : to);
    });
  };

  const stopListening = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    press = null;
  };
  onCleanup(stopListening);

  // Drops the dragged word where the bar shows, sliding the tiles to their
  // new places, and settles it into its own before the tile there shows it
  const onPointerUp = (event) => {
    if (event.pointerId !== press.pointerId) return;
    stopListening();
    const id = dragId();
    if (id === null) return;

    const to = target();
    setTarget(null);
    if (to) {
      setHoverStale(true);
      slideTiles(() => {
        const order = wordOrder();
        const from = order.indexOf(id);
        const index = order.indexOf(to.id) + (to.after ? 1 : 0);
        setWordOrder(moveItem(order, from, from < index ? index - 1 : index));
      });
    }
    const tile = tiles.get(id);
    if (reducedMotion() || !tile) {
      endDrag();
      return;
    }
    slideOf(tile)?.cancel();
    const rect = tile.getBoundingClientRect();
    // Landing as the tile looks, when the other tiles land, before which
    // hovering one would cut its slide short. Held at the end until it's
    // gone, so it can't show at the pointer again for a frame.
    const landing = {
      translate: `${rect.left}px ${rect.top}px`,
      scale: 1,
      boxShadow: 'none',
    };
    settling = [copyTile, copyLetters].map((layer) =>
      layer.animate([landing], { ...SLIDE, fill: 'forwards' }),
    );
    settling[0].onfinish = endDrag;
  };

  // Once the tiles are in place, the first move of the pointer puts it over
  // the right word again
  const endDrag = () => {
    setDragId(null);
    window.addEventListener('pointermove', () => setHoverStale(false), {
      once: true,
    });
  };

  // The browser took the pointer over, e.g. for a gesture: put the word back
  const onPointerCancel = (event) => {
    if (event.pointerId === press.pointerId) cancelDrag();
  };

  // Also stops a dropped word settling, so that it can't end a drag begun
  // on the next sentence meanwhile
  function cancelDrag() {
    stopListening();
    for (const animation of settling) animation.cancel();
    batch(() => {
      setTarget(null);
      setDragId(null);
    });
  }

  // A layer of the dragged word's copy: its tile, with the letters hidden to
  // size it, or its letters
  const CopyLayer = (layer) => (
    <div
      ref={layer.ref}
      class="word-tile drag-overlay"
      classList={{ letters: layer.letters }}
      style={{
        // The translate property, unlike transform, isn't scaled by the
        // copy's scale
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
  );

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
          sorting: dragId() !== null,
          'hover-stale': hoverStale(),
        }}
      >
        <For each={wordOrder()}>
          {(id) => {
            onCleanup(() => tiles.delete(id));
            return (
              <div
                ref={(tile) => tiles.set(id, tile)}
                class="word-tile"
                classList={{
                  dragged: dragId() === id,
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

      <Show when={target()}>
        {(to) => (
          <Portal>
            <div class="drop-bar" style={dropBarStyle(to())} />
          </Portal>
        )}
      </Show>

      <Show when={dragId() !== null && words()[dragId()]}>
        <Portal>
          <CopyLayer ref={copyTile} />
          <CopyLayer ref={copyLetters} letters />
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
