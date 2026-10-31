#!/usr/bin/env node
// Stands in for the VOICEVOX engine: answers like its HTTP API does with a
// moment of silence, and reports how many clips it made so tests can check the
// cache
import http from 'node:http';
import { text } from 'node:stream/consumers';

const SILENCE = (() => {
  const dataSize = 4800;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // Mono
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
})();

let synthesized = 0;

const json = (res, body) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/version') {
      json(res, '0.0.0');
    } else if (url.pathname === '/speakers') {
      json(res, [
        { name: '別の声', styles: [{ name: 'ノーマル', id: 1 }] },
        { name: '春日部つむぎ', styles: [{ name: 'ノーマル', id: 8 }] },
      ]);
    } else if (url.pathname === '/audio_query' && req.method === 'POST') {
      const input = url.searchParams.get('text');
      if (input === 'engine error') {
        res.writeHead(500).end();
      } else {
        json(res, { kana: input, speaker: url.searchParams.get('speaker') });
      }
    } else if (url.pathname === '/synthesis' && req.method === 'POST') {
      const query = JSON.parse(await text(req));
      if (query.speaker !== url.searchParams.get('speaker')) {
        res.writeHead(422).end();
        return;
      }
      synthesized++;
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(SILENCE);
    } else if (url.pathname === '/synthesized') {
      json(res, { synthesized });
    } else {
      res.writeHead(404).end();
    }
  })
  .listen(parseInt(process.argv[2]));
