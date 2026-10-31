import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// tests/fixtures/fake-voicevox.js listens here (see playwright.config.js)
const RUNNING_URL = 'http://127.0.0.1:3008';
// Nothing listens here
const FREE_URL = 'http://127.0.0.1:3009';

let dir;

test.beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'narabe-voice-'));
});

test.afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function voice(args, url) {
  const child = spawn('node', ['scripts/voice.js', ...args], {
    env: {
      ...process.env,
      VOICEVOX_DIR: path.join(dir, 'engine'),
      VOICEVOX_URL: url,
    },
  });
  const output = [];
  child.stdout.on('data', (data) => output.push(data));
  child.stderr.on('data', (data) => output.push(data));
  const done = new Promise((resolve) =>
    child.on('close', (code) =>
      resolve({ code, output: Buffer.concat(output).toString() }),
    ),
  );
  return { child, done };
}

// Installs an engine that reports how it was started and stopped
async function installFakeEngine(code = '') {
  const engine = path.join(dir, 'engine');
  await fs.mkdir(engine);
  await fs.writeFile(
    path.join(engine, 'run'),
    `#!/usr/bin/env node
const fs = require('fs');
const report = (line) => fs.appendFileSync(${JSON.stringify(path.join(dir, 'report'))}, line + '\\n');
report(JSON.stringify(process.argv.slice(2)));
process.on('SIGTERM', () => { report('stopped'); process.exit(0); });
setInterval(() => {}, 1000);
${code}
`,
    { mode: 0o755 },
  );
}

const report = () =>
  fs.readFile(path.join(dir, 'report'), 'utf-8').catch(() => '');

test.describe('npm run voice', () => {
  test('with --if-installed, says how to install rather than downloading', async () => {
    const { code, output } = await voice(['--if-installed'], FREE_URL).done;
    expect(code).toBe(0);
    expect(output).toContain('npm run voice');
    expect(await fs.readdir(dir)).toEqual([]);
  });

  test('leaves an engine that is already running alone', async () => {
    await installFakeEngine();
    const { code, output } = await voice([], RUNNING_URL).done;
    expect(code).toBe(0);
    expect(output).toContain('Already running');
    expect(await report()).toBe('');
  });

  test('does not install or start for an engine on another machine', async () => {
    const { code, output } = await voice([], 'http://192.0.2.1:50021').done;
    expect(code).toBe(0);
    expect(output).toContain('on another machine');
    expect(await fs.readdir(dir)).toEqual([]);
  });

  test('starts the engine on this machine only, and stops it with itself', async () => {
    await installFakeEngine();
    const { child, done } = voice(['--if-installed'], FREE_URL);
    await expect.poll(report).toBe('["--host","127.0.0.1","--port","3009"]\n');

    child.kill('SIGTERM');
    expect((await done).code).toBe(0);
    expect(await report()).toContain('stopped');
  });

  test('a crash only fails without --if-installed', async () => {
    await installFakeEngine('process.exit(3);');

    const required = await voice([], FREE_URL).done;
    expect(required.code).toBe(1);
    expect(required.output).toContain('the engine stopped with 3');

    const optional = await voice(['--if-installed'], FREE_URL).done;
    expect(optional.code).toBe(0);
    expect(optional.output).toContain('the engine stopped with 3');
  });

  test('only shows the engine’s stdout when run on its own', async () => {
    await installFakeEngine(
      "console.log('progress'); console.error('trouble'); process.exit(3);",
    );

    const own = await voice([], FREE_URL).done;
    expect(own.output).toContain('progress');
    expect(own.output).toContain('trouble');

    const alongside = await voice(['--if-installed'], FREE_URL).done;
    expect(alongside.output).not.toContain('progress');
    expect(alongside.output).toContain('trouble');
  });

});
