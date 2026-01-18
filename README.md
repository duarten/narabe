# Narabe

A Japanese sentence ordering game. Create games by entering Japanese sentences, then practice by dragging words into the correct order.

## Setup

```bash
npm install
cp .env.example .env  # Add your ANTHROPIC_API_KEY
```

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

- `ANTHROPIC_API_KEY` - Required. Your Anthropic API key.
- `PORT` - Server port (default: 8080 in production, 3001 in dev)
- `DATA_DIR` - Game storage directory (default: `data`)
