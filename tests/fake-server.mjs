import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const root = new URL('../', import.meta.url);
const server = createServer(async (request, response) => {
  if (request.url === '/health') {
    response.end('ready');
    return;
  }
  if (request.url === '/frame.png') {
    response.setHeader('Content-Type', 'image/png');
    response.end(await readFile(new URL('design/stream-frame.png', root)));
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(await readFile(new URL('tests/fixtures/twitch.html', root)));
});
server.listen(4179, '127.0.0.1');
