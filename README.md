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

## Furigana

Word readings are drawn by [Furifont](https://furifont.antfu.me) (v0.5.1), a font with furigana built into its glyphs, vendored in `src/assets/furifont/`. The font is licensed under the SIL OFL 1.1 (`OFL.txt`) and its reading lists under CC BY-SA 4.0 (`DATA-LICENSE.md`).
