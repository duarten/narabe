import {
  createSignal,
  createEffect,
  createMemo,
  For,
  Show,
  onMount,
  batch,
} from 'solid-js';
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  createSortable,
  createDroppable,
  closestCenter,
} from '@thisbeyond/solid-dnd';

function SortableWord(props) {
  const sortable = createSortable(props.id);

  return (
    <div
      ref={sortable.ref}
      class="word-tile"
      classList={{
        dragging: sortable.isActiveDraggable,
        'drop-target': props.isDropTarget,
        'with-hints': props.showReadings || props.showMeanings,
      }}
      {...sortable.dragActivators}
    >
      <Show when={props.showReadings && props.word.reading}>
        <span class="word-reading">{props.word.reading}</span>
      </Show>
      <span class="word-text">{props.word.word}</span>
      <Show when={props.showMeanings}>
        <span class="word-meaning">{props.word.meaning}</span>
      </Show>
    </div>
  );
}

function EndDropZone(props) {
  const droppable = createDroppable('end-zone');

  return (
    <div
      ref={droppable.ref}
      class="end-drop-zone"
      classList={{
        'drop-target': props.isDropTarget,
        visible: props.isDragging,
      }}
    />
  );
}

function SentenceBoard(props) {
  const [wordOrder, setWordOrder] = createSignal([]);
  const [activeId, setActiveId] = createSignal(null);
  const [dropTargetId, setDropTargetId] = createSignal(null);
  const [shuffledSentence, setShuffledSentence] = createSignal(null);

  // Fisher-Yates shuffle, ensuring we don't end up with correct order
  const shuffleIndices = (length) => {
    const indices = Array.from({ length }, (_, i) => i);

    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    // Keep shuffling until we get an order that's not correct
    let shuffled = shuffle([...indices]);
    let attempts = 0;
    while (
      shuffled.every((val, idx) => val === idx) &&
      length > 1 &&
      attempts < 10
    ) {
      shuffled = shuffle([...indices]);
      attempts++;
    }

    return shuffled;
  };

  // Shuffle words when sentence changes
  createEffect(() => {
    const sentence = props.sentence;
    if (sentence?.words && sentence.original !== shuffledSentence()) {
      batch(() => {
        setShuffledSentence(sentence.original);
        setWordOrder(shuffleIndices(sentence.words.length));
      });
    }
  });

  // Reset to correct order when skipped
  createEffect(() => {
    if (props.state === 'skipped' && props.sentence?.words) {
      setWordOrder(props.sentence.words.map((_, i) => i));
    }
  });

  const orderedWords = createMemo(() => {
    if (!props.sentence?.words) return [];
    return wordOrder().map((i) => ({
      ...props.sentence.words[i],
      originalIndex: i,
    }));
  });

  const isCorrect = createMemo(() => {
    if (!props.sentence?.words) return false;
    // Only check correctness if word order belongs to the current sentence
    if (props.sentence.original !== shuffledSentence()) return false;
    const order = wordOrder();
    if (order.length !== props.sentence.words.length) return false;
    return order.every((val, idx) => val === idx);
  });

  // Auto-detect correct answer
  createEffect(() => {
    if (isCorrect() && props.state === 'playing') {
      props.onCorrect();
    }
  });

  const handleDragStart = ({ draggable }) => {
    setActiveId(draggable.id);
  };

  const handleDragOver = ({ droppable }) => {
    setDropTargetId(droppable?.id ?? null);
  };

  const handleDragEnd = ({ draggable, droppable }) => {
    setActiveId(null);
    setDropTargetId(null);

    if (draggable && droppable) {
      const currentOrder = wordOrder();
      const fromIndex = currentOrder.indexOf(draggable.id);

      // Handle drop on end zone
      if (droppable.id === 'end-zone') {
        const newOrder = [...currentOrder];
        newOrder.splice(fromIndex, 1);
        newOrder.push(draggable.id);
        setWordOrder(newOrder);
        return;
      }

      const toIndex = currentOrder.indexOf(droppable.id);

      if (fromIndex !== toIndex) {
        const newOrder = [...currentOrder];
        newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, draggable.id);
        setWordOrder(newOrder);
      }
    }
  };

  const activeWord = createMemo(() => {
    const id = activeId();
    if (id === null || !props.sentence?.words) return null;
    return props.sentence.words[id];
  });

  return (
    <div
      class="sentence-board"
      classList={{
        correct: props.state === 'correct',
        skipped: props.state === 'skipped',
      }}
    >
      <DragDropProvider
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        collisionDetector={closestCenter}
      >
        <DragDropSensors />
        <div class="words-container">
          <SortableProvider ids={wordOrder()}>
            <For each={orderedWords()}>
              {(word) => (
                <SortableWord
                  id={word.originalIndex}
                  word={word}
                  showReadings={props.showReadings}
                  showMeanings={props.showMeanings}
                  isDropTarget={
                    dropTargetId() === word.originalIndex &&
                    activeId() !== word.originalIndex
                  }
                />
              )}
            </For>
          </SortableProvider>
          <EndDropZone
            isDragging={activeId() !== null}
            isDropTarget={dropTargetId() === 'end-zone'}
          />
        </div>
        <DragOverlay>
          <Show when={activeWord()}>
            <div class="word-tile dragging-overlay">
              <Show when={props.showReadings && activeWord().reading}>
                <span class="word-reading">{activeWord().reading}</span>
              </Show>
              <span class="word-text">{activeWord().word}</span>
              <Show when={props.showMeanings}>
                <span class="word-meaning">{activeWord().meaning}</span>
              </Show>
            </div>
          </Show>
        </DragOverlay>
      </DragDropProvider>

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
