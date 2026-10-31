#!/usr/bin/env node
// Runs the VOICEVOX engine that speaks words and sentences, installing it
// first if need be. With --if-installed, as in `npm run dev`, it never makes
// that 2 GB download, and the game just goes without speech.
import 'dotenv/config';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

const VERSION = '0.26.0';
// The build for each platform, with the digest GitHub lists for its release.
// A .vvpp is a zip of the engine.
const BUILDS = {
  'darwin-arm64': {
    name: 'macos-arm64',
    sha256: '361dcb631617e050211c3a243583d1e911960c5296f18591521f8355fa294ad5',
  },
  'darwin-x64': {
    name: 'macos-x64',
    sha256: '83fcfbae457677c1e78af1280788d9f65b28a7a5bc22dc5012f7bcbe60dbe5c6',
  },
  'linux-arm64': {
    name: 'linux-cpu-arm64',
    sha256: '9bba2207bb1128716d21cd9ac8b7b638c07e20106d96977cdc9fcf21186b9872',
  },
  'linux-x64': {
    name: 'linux-cpu-x64',
    sha256: 'bdb5109c8a84125261af10f92b811304256ad3233c1c9dfe8eb3e0e2d8739a23',
  },
};

const ENGINE_DIR =
  process.env.VOICEVOX_DIR ||
  path.join(import.meta.dirname, '..', '.voicevox', VERSION);
const ENGINE_URL = new URL(
  process.env.VOICEVOX_URL || 'http://127.0.0.1:50021',
);
const IF_INSTALLED = process.argv.includes('--if-installed');

const log = (message) => console.log(`VOICEVOX: ${message}`);

const exists = (file) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} stopped with ${signal ?? code}`)),
    );
  });

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function install() {
  const build = BUILDS[`${process.platform}-${process.arch}`];
  if (!build) {
    throw new Error(
      `no build for ${process.platform}-${process.arch}; see https://github.com/VOICEVOX/voicevox_engine/releases`,
    );
  }

  await fs.mkdir(path.dirname(ENGINE_DIR), { recursive: true });
  const archive = `${ENGINE_DIR}.vvpp`;
  // Each step leaves its result under another name until it's complete, so an
  // interrupted install picks up where it left off
  if (!(await exists(archive))) {
    log(`Downloading engine ${VERSION} (about 2 GB)...`);
    const partial = `${archive}.partial`;
    await run('curl', [
      '--fail',
      '--location',
      '--retry',
      '3',
      '--continue-at',
      '-',
      '--output',
      partial,
      `https://github.com/VOICEVOX/voicevox_engine/releases/download/${VERSION}/voicevox_engine-${build.name}-${VERSION}.vvpp`,
    ]);
    await fs.rename(partial, archive);
  }

  // This is about to be run, so it had better be what was released
  log('Verifying the download...');
  if ((await sha256(archive)) !== build.sha256) {
    await fs.rm(archive);
    throw new Error('the download is corrupt, and was deleted; try again');
  }

  log('Unpacking...');
  const unpacking = `${ENGINE_DIR}.partial`;
  await fs.rm(unpacking, { recursive: true, force: true });
  await run('unzip', ['-q', archive, '-d', unpacking]);
  await fs.rename(unpacking, ENGINE_DIR);
  await fs.rm(archive);
}

const isRunning = () =>
  fetch(new URL('/version', ENGINE_URL), {
    signal: AbortSignal.timeout(1000),
  }).then(
    (res) => res.ok,
    () => false,
  );

// Only for this machine, as anyone who can reach it can use it
function startEngine() {
  return new Promise((resolve, reject) => {
    const engine = spawn(
      path.join(ENGINE_DIR, 'run'),
      ['--host', '127.0.0.1', '--port', ENGINE_URL.port || '80'],
      // Its stdout is a progress bar and every request, too much alongside
      // the game's own output, while what goes wrong goes to stderr
      {
        cwd: ENGINE_DIR,
        stdio: ['ignore', IF_INSTALLED ? 'ignore' : 'inherit', 'inherit'],
      },
    );
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        stopping = true;
        engine.kill(signal);
      });
    }
    engine.on('error', reject);
    engine.on('close', (code, signal) =>
      stopping
        ? resolve()
        : reject(new Error(`the engine stopped with ${signal ?? code}`)),
    );
  });
}

async function main() {
  if (!['127.0.0.1', 'localhost'].includes(ENGINE_URL.hostname)) {
    log(`Nothing to start, as ${ENGINE_URL} is on another machine`);
    return;
  }
  // It might be the VOICEVOX app, or `npm run voice` in another terminal
  if (await isRunning()) {
    log(`Already running at ${ENGINE_URL}`);
    return;
  }

  if (!(await exists(path.join(ENGINE_DIR, 'run')))) {
    if (IF_INSTALLED) {
      log('Not installed, so no speech. `npm run voice` installs it.');
      return;
    }
    await install();
  }

  log(`Starting at ${ENGINE_URL}`);
  await startEngine();
}

main().catch((err) => {
  console.error(`VOICEVOX: ${err.message}`);
  // The game is fine without speech, so this shouldn't take it down with it
  process.exitCode = IF_INSTALLED ? 0 : 1;
});
