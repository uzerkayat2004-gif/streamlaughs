import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

let login = 'nightowl_tv';
const codes = new Map(),
  tokens = new Map();
const count = { authorize: 0, exchange: 0, validate: 0, videos: 0 };
const redirect = 'http://127.0.0.1:3000/auth/callback',
  created = new Date(
    Math.floor((Date.now() - 15 * 60000) / 60000) * 60000,
  ).toISOString();
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4191');
  const json = (value, status = 200) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(value));
  };
  if (url.pathname === '/health') return json({ ok: true });
  if (url.pathname === '/fixture/counts') return json(count);
  let text = '';
  if (request.method === 'POST')
    for await (const chunk of request) {
      text += chunk;
      if (text.length > 4096) return json({}, 413);
    }
  if (url.pathname === '/fixture/user' && request.method === 'POST') {
    const next = JSON.parse(text).login;
    if (!['nightowl_tv', 'other_streamer'].includes(next)) return json({}, 400);
    login = next;
    return json({ ok: true });
  }
  if (url.pathname === '/oauth2/authorize') {
    if (
      url.searchParams.get('redirect_uri') !== redirect ||
      url.searchParams.get('client_id') !== 'local-twitch-client' ||
      url.searchParams.get('response_type') !== 'code' ||
      url.searchParams.get('scope') !== ''
    )
      return json({}, 400);
    count.authorize++;
    const code = randomUUID();
    codes.set(code, login);
    const target = new URL(redirect);
    target.search = new URLSearchParams({
      code,
      state: url.searchParams.get('state') ?? '',
    }).toString();
    response.writeHead(302, { Location: target.href });
    response.end();
    return;
  }
  if (url.pathname === '/oauth2/token') {
    const body = new URLSearchParams(text);
    if (
      body.get('client_id') !== 'local-twitch-client' ||
      body.get('client_secret') !== 'local-twitch-secret'
    )
      return json({}, 401);
    if (body.get('grant_type') === 'client_credentials')
      return json({
        access_token: 'local-app-token',
        expires_in: 3600,
        token_type: 'bearer',
      });
    const code = body.get('code'),
      user = codes.get(code);
    if (!user || body.get('redirect_uri') !== redirect) return json({}, 400);
    codes.delete(code);
    count.exchange++;
    const access = randomUUID();
    tokens.set(access, user);
    return json({
      access_token: access,
      expires_in: 3600,
      scope: [],
      token_type: 'bearer',
    });
  }
  if (url.pathname === '/oauth2/validate') {
    const user = tokens.get(
      (request.headers.authorization ?? '').replace(/^OAuth /, ''),
    );
    if (!user) return json({}, 401);
    count.validate++;
    return json({
      client_id: 'local-twitch-client',
      login: user,
      user_id: user === 'nightowl_tv' ? '12345' : '54321',
      scopes: [],
      expires_in: 3600,
    });
  }
  if (url.pathname === '/helix/users') {
    const user = tokens.get(
      (request.headers.authorization ?? '').replace(/^Bearer /, ''),
    );
    if (!user || request.headers['client-id'] !== 'local-twitch-client')
      return json({}, 401);
    return json({
      data: [{ id: user === 'nightowl_tv' ? '12345' : '54321', login: user }],
    });
  }
  if (url.pathname === '/helix/videos') {
    if (
      request.headers.authorization !== 'Bearer local-app-token' ||
      request.headers['client-id'] !== 'local-twitch-client' ||
      url.searchParams.get('type') !== 'archive'
    )
      return json({}, 401);
    count.videos++;
    return json({
      data:
        url.searchParams.get('user_id') === '12345'
          ? [
              {
                id: '9001',
                title: 'the night the crowd showed up',
                created_at: created,
                duration: '2h0m0s',
              },
            ]
          : [],
      pagination: {},
    });
  }
  json({}, 404);
}).listen(4191, '127.0.0.1');
