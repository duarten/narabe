# Implementation Notes

This file tracks verified implementation details and debugging findings. Update this as issues are found and fixed.

## Overview

Narabe is a Japanese sentence ordering game built with:

- **Frontend**: Solid.js, with drag-and-drop written on pointer events
- **Backend**: Node.js/Express with file-based JSON storage
- **AI**: Anthropic Claude API for sentence processing, or the local Claude Code CLI
- **Testing**: Playwright E2E tests
- **Styling**: Vaporwave aesthetic (CSS)
- **Furigana**: [Furifont](https://furifont.antfu.me), a font that draws readings into its glyphs

## Architecture

```
narabe/
├── server/
│   ├── index.js              # Express server, serves static files in production
│   ├── routes/
│   │   ├── games.js          # Game CRUD (list, get, save, delete)
│   │   └── claude.js         # Sentence processing via the Claude API or Claude Code
│   └── data/                 # Game JSON files stored here
├── src/
│   ├── index.jsx             # Solid.js entry point
│   ├── App.jsx               # Main app with state-based view switching
│   ├── components/
│   │   ├── GameList.jsx      # Home screen with game cards
│   │   ├── GameCreator.jsx   # Create new game form
│   │   ├── GamePlayer.jsx    # Play game, tracks score
│   │   └── SentenceBoard.jsx # Drag-and-drop word ordering
│   ├── styles/
│   │   └── vaporwave.css     # All styling
│   ├── assets/furifont/      # Vendored Furifont font, reading lists, licenses
│   └── lib/
│       ├── api.js            # API client functions
│       └── furigana.js       # Picks the font reading that matches each word
└── tests/
    ├── e2e/                  # Playwright tests
    └── fixtures/             # Stand-in for the Claude Code CLI
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

Tests use separate ports (3002/3004) and a separate data directory (`server/data-test`, passed to the server as an absolute `DATA_DIR`) to avoid affecting user data. This was critical after tests accidentally deleted user's saved games.

### Claude API Prompt

Located in `server/routes/claude.js`. Requests:

1. Word segmentation (particles as separate words)
2. Hiragana readings for each word
3. English meanings
4. Brief grammar breakdown (non-obvious points only)

The response shape is enforced with structured outputs (a JSON schema in `output_config.format`), so there is no JSON extraction from free text. Uses `claude-sonnet-5-5` at `low` effort, with server-side refusal fallback enabled.

`CLAUDE_BACKEND=claude-code` (`npm run local`) runs the Claude Code CLI instead, with the same prompt, schema, model and effort: `claude --print --output-format json --json-schema ...` with the sentence on stdin, reading `structured_output` from the result. It runs with `--tools ''`, `--safe-mode` (none of the user's CLAUDE.md, hooks, MCP servers or plugins) and `--no-session-persistence`, and without `ANTHROPIC_API_KEY` in its environment, which Claude Code would otherwise use instead of its login. On errors (e.g. not logged in) it exits non-zero but still prints its JSON result, with the message in `result`. In this mode the server listens on 127.0.0.1 only. Tests run a second server in this mode (port 3006) with `tests/fixtures/fake-claude.js` as `CLAUDE_CODE_PATH`.

### Furigana

Furifont shows furigana with no markup: for each run of kanji the font holds a glyph with the reading drawn above it. Its readings are dictionary guesses, so when showing readings, `src/lib/furigana.js` lines each word's reading (from Claude) up with its runs of kanji and sets `font-feature-settings: "salt" n` on runs where the font would otherwise show another reading or none. `"ss01"` turns the furigana off while readings are hidden. The grammar breakdown also uses the font, with its default readings. The font needs a `line-height` of about 1.6 or more, or the furigana is clipped.

### Drag and Drop

`SentenceBoard.jsx` implements it on pointer events (mouse, touch and pen alike) rather than with a library, because the tiles vary in width and wrap onto several rows, which transform-based sortables (as in solid-dnd) can't lay out without overlapping tiles. While a word is dragged:

- The tiles show the order it would make (`dragOrder`), reordering the real DOM so flex layout places them; the dragged word's tile stays in the flow as a dashed placeholder, and a copy follows the pointer in a portal. The word order only changes on drop, so the sentence can't be marked correct mid-drag.
- The word goes before or after the word nearest the pointer in its row, by which half of that word the pointer is over (`dropIndex`). It measures offsets rather than rects, so tiles mid-slide count as in their final place.
- Tiles slide to their new places with the Web Animations API (FLIP), from wherever they were shown, so a slide interrupted by another reorder doesn't jump.
- Rows are left-aligned: centered rows shift every tile when a row's contents change, often from under the pointer, which then picks another place, back and forth (seen at phone widths).
- Tiles have `touch-action: none` while the sentence is being played, so dragging on a touch screen doesn't scroll. Dragging is disabled once the sentence is over.

## Important Invariants

### Shuffle Must Never Produce Correct Order

`SentenceBoard.jsx:shuffleIndices()` - After shuffling, if the result is the correct order, re-shuffle (up to 10 attempts). This prevents the game from auto-completing immediately.

### Word Order Must Belong to Current Sentence

`SentenceBoard.jsx:isCorrect()` - Before checking if order is correct, verify:

1. `props.sentence === shuffledSentence()` - The word order was created for this sentence object (identity, not text, so a repeated sentence is shuffled again)
2. `order.length === props.sentence.words.length` - Lengths match

This prevents a race condition where transitioning between sentences could trigger false "correct" detection with stale word order data. `GamePlayer` also batches the signal updates in `handleNext`, so the board never sees the next sentence while the state is still `'skipped'`.

## Bug Fixes

### Race Condition on Sentence Transition (Fixed)

**Problem**: After giving up on sentence 1, clicking "Next" would sometimes show sentence 2 as already correct.

**Cause**: When transitioning sentences, `isCorrect` memo would evaluate before the shuffle effect ran. The old word order `[0,1,2,3]` from "give up" would pass the correctness check for the new sentence.

**Fix**: Added check in `isCorrect` memo to verify `props.sentence.original === shuffledSentence()`. This ensures we only check correctness when the word order belongs to the current sentence.

### Drag to End of Sentence Not Working (Fixed)

**Problem**: Could not drag a word to the very end of the sentence.

**Cause**: Only sortable items were drop targets. No target existed after the last word.

**Fix**: Originally an end drop zone; since the drag-and-drop rewrite, the right half of the last word places a word last.

### Tests Deleting User Data (Fixed)

**Problem**: Running `npm test` deleted games saved in `server/data/`.

**Cause**: Tests and dev server shared the same data directory and ports.

**Fix**: Playwright config uses separate environment:

- `PORT=3002` for test server
- `VITE_PORT=3004` for test client
- `DATA_DIR=<repo>/server/data-test` for test data storage

### API Key Not Loading (Fixed)

**Problem**: Server couldn't find ANTHROPIC_API_KEY.

**Fix**: Added `import 'dotenv/config';` at top of `server/index.js`.

### Games Saved Despite Processing Errors (Fixed)

**Problem**: If Claude API failed, game was still saved with partial/no data.

**Fix**: Check for errors in processing results before saving. Show error message and stay on create screen if any sentence fails.

### Tests Not Seeing Their Own Data (Fixed)

**Problem**: Most tests failed: games seeded by the tests never appeared, and leftover games accumulated in a stray `data-test/` at the repository root.

**Cause**: Tests wrote to `server/data-test`, but the server got `DATA_DIR=data-test`, which resolves against its working directory (the repository root).

**Fix**: `playwright.config.js` passes the absolute path of `server/data-test`.

### Path Traversal in Game Routes (Fixed)

**Problem**: `GET`/`DELETE /api/games/:filename` joined the decoded filename onto `DATA_DIR`, so `..%2F.env` could read or delete files outside it.

**Fix**: `gamePath()` in `games.js` accepts only plain `.json` filenames.

### Games Overwritten on Save (Fixed)

**Problem**: Filenames are the minute plus the name with everything but `a-z0-9` replaced, so two Japanese-named games saved in the same minute got the same filename and the second overwrote the first.

**Fix**: Write with the `wx` flag and add a counter while the filename is taken.

### Large Games Failing to Save (Fixed)

**Problem**: A game is ~2.5KB per sentence, so saving one of ~40 sentences exceeded `express.json()`'s 100KB default, after every sentence had been processed (and paid for).

**Fix**: The JSON body limit is 5MB.

### Repeated Sentence Starting Solved (Fixed)

**Problem**: In a game with the same sentence twice, the second copy started in the order just revealed or solved, and was immediately marked correct.

**Cause**: `SentenceBoard` decided whether to reshuffle by comparing sentence text.

**Fix**: Compare the sentence object instead.

### Drag and Drop Not Smooth (Fixed)

**Problem**: Dragged words overlapped other tiles, the target flickered, and the drop indicator often didn't match where the word landed.

**Cause**: solid-dnd's sortable moves each tile into the slot of the tile previously there, which overlaps tiles of different widths, and it measures tiles only when a drag starts, while a hovered tile's 60px margin reflowed the rows under it. Hovering the end zone reset the preview, the indicator always showed a gap before the target although dragging rightwards dropped after it, `transition: all` animated all of this, and every drop recreated all tiles.

**Fix**: Drag-and-drop rewritten on pointer events (see Drag and Drop above).

## Testing

```bash
npm test              # Run all tests
npm run test:headed   # See browser
npm run test:ui       # Interactive mode
```

Tests mock the Claude API to avoid costs and ensure consistent results.
