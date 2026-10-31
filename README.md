# Narabe

A Japanese sentence ordering game. Create games by entering Japanese sentences, then practice by dragging words into the correct order.

## Setup

Requires Node.js 22.12 or later.

```bash
npm install
cp .env.example .env  # Add your ANTHROPIC_API_KEY
```

## Playing Locally with Claude Code

Instead of an API key, sentences can be processed by your local [Claude Code](https://claude.com/claude-code), as whatever account it's logged in with (such as a Claude subscription):

```bash
npm run local  # Builds, then serves at http://localhost:8080
```

Claude Code must be installed and logged in (check with `claude auth status`). Each sentence runs `claude --print` with no tools and none of your Claude Code settings, hooks, MCP servers or plugins, and isn't saved as a session. Any `ANTHROPIC_API_KEY` is kept from it, since Claude Code would bill the key instead of its login. In this mode the server only accepts connections from this machine.

To develop in this mode, set `CLAUDE_BACKEND=claude-code` in `.env` and run `npm run dev`.

## Speech

Words and sentences are spoken by [VOICEVOX](https://github.com/VOICEVOX/voicevox_engine), which runs locally. It's optional: the game has no speech while the engine isn't running, and picks it up the next time a game is opened after it starts.

```bash
npm run voice  # Installs the engine if need be (about 2 GB), then runs it
```

The engine goes in `.voicevox/` (macOS and Linux). To remove it, delete that folder and the few KB of settings the engine keeps in `~/Library/Application Support/voicevox-engine` (on Linux, `~/.local/share/voicevox-engine`). Once installed, `npm run dev` and `npm run local` start it too, so `npm run voice` is only needed once, and can be stopped with Ctrl-C after installing. They leave alone an engine that's already running, such as the VOICEVOX app.

Or run it with Docker instead:

```bash
docker run --rm -p '127.0.0.1:50021:50021' voicevox/voicevox_engine:cpu-latest
```

While playing, tap a word to hear it. Once a sentence is solved or skipped, Play Sentence plays the whole of it, which would give away the order any earlier.

VOICEVOX's terms and each voice's own terms require crediting it, so the game shows the voice's credit below the controls. Check [the voice's terms](https://voicevox.hiroshiba.jp/) before choosing another.

## Development

```bash
npm run dev
```

Opens at http://localhost:3000

## Testing

```bash
npm test              # Run all tests
npm run test:headed   # Run with browser visible
npm run test:ui       # Interactive UI mode
```

## Deployment

```bash
# Build locally
npm run build

# Upload to server
scp -r package.json server dist .env user@host:/path/to/narabe/

# On server
npm install --omit=dev
npm start  # Runs on port 8080
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key. Required unless using Claude Code.
- `CLAUDE_BACKEND` - `api` (default) to process sentences with the Claude API, or `claude-code` to use the local Claude Code CLI
- `CLAUDE_CODE_PATH` - Claude Code executable (default: `claude`)
- `PORT` - Server port (default: 8080 in production, 3001 in dev)
- `DATA_DIR` - Game storage directory (default: `server/data`)
- `VOICEVOX_URL` - The VOICEVOX engine (default: `http://127.0.0.1:50021`)
- `VOICEVOX_SPEAKER` - The voice, as a style id from the engine's `/speakers` (default: `8`, 春日部つむぎ)
- `VOICEVOX_DIR` - Where `npm run voice` installs and looks for the engine (default: `.voicevox/<version>`)
- `TTS_CACHE_DIR` - Where synthesized speech is cached (default: `server/tts-cache`)

## Furigana

Word readings are drawn by [Furifont](https://furifont.antfu.me) (v0.5.1), a font with furigana built into its glyphs, vendored in `src/assets/furifont/`. The font is licensed under the SIL OFL 1.1 (`OFL.txt`) and its reading lists under CC BY-SA 4.0 (`DATA-LICENSE.md`).
