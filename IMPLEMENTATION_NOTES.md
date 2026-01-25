# Implementation Notes

This file tracks verified implementation details and debugging findings. Update this as issues are found and fixed.

## Overview

Narabe is a Japanese sentence ordering game built with:
- **Frontend**: Solid.js + @thisbeyond/solid-dnd for drag-and-drop
- **Backend**: Node.js/Express with file-based JSON storage
- **AI**: Anthropic Claude API for sentence processing
- **Testing**: Playwright E2E tests
- **Styling**: Vaporwave aesthetic (CSS)

## Architecture

```
narabe/
├── server/
│   ├── index.js              # Express server, serves static files in production
│   ├── routes/
│   │   ├── games.js          # Game CRUD (list, get, save, delete)
│   │   └── claude.js         # Claude API proxy for sentence processing
│   └── data/                 # Game JSON files stored here
├── src/
│   ├── index.jsx             # Solid.js entry point
│   ├── App.jsx               # Main app with state-based view switching
│   ├── components/
│   │   ├── GameList.jsx      # Home screen with game cards
│   │   ├── GameCreator.jsx   # Create new game form
│   │   ├── GamePlayer.jsx    # Play game, tracks score
│   │   └── SentenceBoard.jsx # Drag-drop word ordering
│   ├── styles/
│   │   └── vaporwave.css     # All styling
│   └── lib/
│       └── api.js            # API client functions
└── tests/e2e/                # Playwright tests
```

## Game Data Schema

```json
{
  "name": "Game Name",
  "createdAt": "2024-01-15T14:30:00.000Z",
  "sentences": [
    {
      "original": "私は学生です",
      "words": [
        { "word": "私", "reading": "わたし", "meaning": "I, me" },
        { "word": "は", "reading": "は", "meaning": "topic marker" }
      ],
      "grammarBreakdown": "Brief explanation of grammar points..."
    }
  ]
}
```

## Key Design Decisions

### State-based Navigation
The app uses state-based view switching in App.jsx (not URL routing). Views: `'list'`, `'create'`, `'play'`. This means no SPA fallback is needed for production static file serving.

### Test Isolation
Tests use separate ports (3002/3004) and a separate data directory (`DATA_DIR=data-test`) to avoid affecting user data. This was critical after tests accidentally deleted user's saved games.

### Claude API Prompt
Located in `server/routes/claude.js`. Requests:
1. Word segmentation (particles as separate words)
2. Hiragana readings for each word
3. English meanings
4. Brief grammar breakdown (non-obvious points only)

## Important Invariants

### Shuffle Must Never Produce Correct Order
`SentenceBoard.jsx:shuffleIndices()` - After shuffling, if the result is the correct order, re-shuffle (up to 10 attempts). This prevents the game from auto-completing immediately.

### Word Order Must Belong to Current Sentence
`SentenceBoard.jsx:isCorrect()` - Before checking if order is correct, verify:
1. `props.sentence.original === shuffledSentence()` - The word order was created for this sentence
2. `order.length === props.sentence.words.length` - Lengths match

This prevents a race condition where transitioning between sentences could trigger false "correct" detection with stale word order data.

## Bug Fixes

### Race Condition on Sentence Transition (Fixed)
**Problem**: After giving up on sentence 1, clicking "Next" would sometimes show sentence 2 as already correct.

**Cause**: When transitioning sentences, `isCorrect` memo would evaluate before the shuffle effect ran. The old word order `[0,1,2,3]` from "give up" would pass the correctness check for the new sentence.

**Fix**: Added check in `isCorrect` memo to verify `props.sentence.original === shuffledSentence()`. This ensures we only check correctness when the word order belongs to the current sentence.

### Drag to End of Sentence Not Working (Fixed)
**Problem**: Could not drag a word to the very end of the sentence.

**Cause**: Only sortable items were drop targets. No target existed after the last word.

**Fix**: Added `EndDropZone` component using `createDroppable('end-zone')`. Updated `handleDragEnd` to handle drops on `'end-zone'` by moving the dragged item to the end of the array.

### Tests Deleting User Data (Fixed)
**Problem**: Running `npm test` deleted games saved in `server/data/`.

**Cause**: Tests and dev server shared the same data directory and ports.

**Fix**: Playwright config uses separate environment:
- `PORT=3002` for test server
- `VITE_PORT=3004` for test client
- `DATA_DIR=data-test` for test data storage

### API Key Not Loading (Fixed)
**Problem**: Server couldn't find ANTHROPIC_API_KEY.

**Fix**: Added `import 'dotenv/config';` at top of `server/index.js`.

### Games Saved Despite Processing Errors (Fixed)
**Problem**: If Claude API failed, game was still saved with partial/no data.

**Fix**: Check for errors in processing results before saving. Show error message and stay on create screen if any sentence fails.

## Testing

```bash
npm test              # Run all 24 tests
npm run test:headed   # See browser
npm run test:ui       # Interactive mode
```

Tests mock the Claude API to avoid costs and ensure consistent results.
