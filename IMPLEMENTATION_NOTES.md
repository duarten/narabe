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
- **Speech**: [VOICEVOX](https://github.com/VOICEVOX/voicevox_engine), a local speech engine (optional)

## Architecture

```
narabe/
├── server/
│   ├── index.js              # Express server, serves static files in production
│   ├── routes/
│   │   ├── games.js          # Game CRUD (list, get, save, delete)
│   │   ├── claude.js         # Sentence processing via the Claude API or Claude Code
│   │   └── tts.js            # Speech via the VOICEVOX engine, cached on disk
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
│       ├── furigana.js       # Picks the font reading that matches each word
│       └── speech.js         # Plays one clip at a time
└── tests/
    ├── e2e/                  # Playwright tests
    └── fixtures/             # Stand-ins for the Claude Code CLI and VOICEVOX
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

A `<ruby>` shows what the font can't draw: a reading of a lone kanji or a word that its list doesn't have, a lone kanji's only reading unless it's the default (`lone`), and a reading that can't be lined up with its word (`2人` → ふたり, over the whole word). `.ivs.json` is enough to tell: Furifont's planner only makes salt glyphs for a kanji with two or more readings (`buildRules`), so the 910 kanji with one reading and no default, like 軋 → きし, stay bare whatever the salt, and `salt 1` turns a kanji with one reading and a default, like 区, bare. A word the lists don't have is left to the font's guess, as they don't say whether the font has it. The `<rt>` is out of flow and placed where the font draws its furigana, as a ruby's own layout pushes the kanji down 3px and widens it to fit the reading, unlike the font's furigana.

### Speech

`server/routes/tts.js` calls the VOICEVOX engine (`POST /audio_query`, then its result to `POST /synthesis`) and caches each clip in `TTS_CACHE_DIR`, by voice and text. Tested with engine 0.26.0: on an Apple Silicon Mac a short sentence takes ~0.4s the first time and ~2ms from the cache. `GET /api/tts/voice` says whether the engine is up and what credit to show; `GamePlayer` hides all speech if it isn't. The credit is required by the engine's terms and the voice's, so it's shown wherever speech is offered.

- **Spoilers**: the sentence can only be played once it's over, as hearing it gives away the order. During play, a tap on a tile (a press that never reached `DRAG_THRESHOLD`) plays just that word.
- **What's sent is the text as written**, not `reading`. The engine reads a lone particle correctly (は → ワ, へ → エ), and `reading` is worse: がくせい comes out ガクセイ where 学生 comes out ガクセエ, and kana can get the wrong pitch accent: 橋 is ハシ' and 箸 is ハ'シ, but はし is always ハ'シ.
- **Known limitation**: the engine guesses each kanji's reading, so it can disagree with `reading`, mostly for a word on its own: 今日 is always キョオ, even with the reading こんにち, and 人 always ヒト. The fix would be to compare `kana` in the `/audio_query` result to the reading and adjust the query before synthesis.
- **Playback**: `speech.js` gives an `Audio` the server's URL and plays it within the tap, rather than fetching first, since browsers can refuse to start audio once the gesture has expired. Interrupting a clip rejects `play()` with an `AbortError`, which isn't a failure. Moving on to the next sentence or leaving the game stops the audio.
- **The cache has no eviction**. Clips are small (~48KB a second), but on a server open to others the 500-character limit is all that holds back what they can make it synthesize and store.

### Drag and Drop

`SentenceBoard.jsx` implements it on pointer events (mouse, touch and pen alike) rather than with a library, because the tiles vary in width and wrap onto several rows, which transform-based sortables (as in solid-dnd) can't lay out without overlapping tiles. While a word is dragged:

- The tiles stay in place, the dragged word's faded in its own, while a copy follows the pointer in a portal and a bar in the gap beside a word shows where it would go (`target`). Moving tiles around mid-drag shifted them from under the pointer. The word order only changes on drop, so the sentence can't be marked correct mid-drag.
- The copy is usually over the bar, so the bar is drawn over the copy's tile but under its letters. That takes the copy in two layers, its tile and its letters, since each element that's fixed or scaled paints as one; the bar is also in a portal, as the app's stacking context would keep it under both.
- The word goes before or after the word nearest the pointer in its row, by which half of that word the pointer is over (`dropTarget`), so the bar can be at the end of a row or at the start of the next, the same place in the order. Over no row, as between rows, the bar stays where it was; over the word's own tile, it goes, and a drop leaves the word where it was. It measures offsets rather than rects, so tiles still sliding from the last drop count as in their final place.
- On drop, tiles slide to their new places with the Web Animations API (FLIP), from wherever they were shown, so a slide interrupted by another drop doesn't jump. The copy settles into the word's new place with the same timing, losing its lift, so it hands over to the tile without a pop, and it holds its last frame (`fill: 'forwards'`) until it's removed so it can't flash back at the pointer.
- Hover effects are off until the tiles are in place, since a CSS transition overrides a running slide, and then until the pointer moves (`hoverStale`): the browser doesn't re-check what's under a still pointer when the tiles move, so a word that slid away from under it would lift.
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
