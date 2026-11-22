// The simulator's stand-in Supabase (CUL-2875, Workflow v2 PR-11). A small HTTP server on
// 127.0.0.1 that the simulator build's bundle points at, so the golden flow signs in as the
// fixture owner and logs a meal with no real project, account or row reachable from it.
//
//   node --experimental-strip-types scripts/sim/fixtureServer.ts [port]
//
// It is the capture path's fixture (scripts/web-capture/fixtureRest.ts renders the device-pass
// story as PostgREST rows) behind a real socket instead of Playwright's route(), plus the
// auth and storage answers capture.mjs gives inline. Two differences from capture, both
// because a phone, unlike the capture browser, signs in through the app's own login screen
// and runs on the real clock:
//   - the password grant is answered, for the fixture email and FIXTURE_PASSWORD only, so
//     the flow types credentials the way an owner does;
//   - the story is materialised one day back (`now - 1 day`), so the record ends yesterday
//     and today is empty. A meal on Home's Today card can then only be the one the flow just
//     logged: with the story's own morning meal there, a broken log would still pass.
//
// Writes land. PostgREST POST / PATCH upsert into the in-memory tables by `id`, so a later
// pull returns what the app pushed rather than contradicting it, and every write is logged
// on stdout (`write <table> <n> row(s)`), which the workflow's summary counts.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { answerRest, buildFixtureTables, FIXTURE_EMAIL, FIXTURE_USER_ID } from '../web-capture/fixtureRest.ts';

type Row = Record<string, unknown>;

/** Not a secret: the fixture account exists only inside this process. */
export const FIXTURE_PASSWORD = 'fixture-password-2875';
export const DEFAULT_PORT = 54321;
const DAY_MS = 86_400_000;

export interface FixtureServerOptions {
  /** The real clock. The story is materialised a day before it. */
  nowMs?: number;
  log?: (line: string) => void;
}

function b64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

/** The fixture owner's user and a session good for a year past `nowMs` (capture.mjs's shape). */
export function fixtureSession(nowMs: number) {
  const exp = Math.floor(nowMs / 1000) + 365 * 86400;
  const user = {
    id: FIXTURE_USER_ID, aud: 'authenticated', role: 'authenticated', email: FIXTURE_EMAIL,
    email_confirmed_at: new Date(nowMs - 60 * DAY_MS).toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    created_at: new Date(nowMs - 60 * DAY_MS).toISOString(),
  };
  const accessToken =
    `${b64url({ alg: 'HS256', typ: 'JWT' })}.` +
    `${b64url({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp, email: user.email })}.fixture`;
  return {
    user,
    session: {
      access_token: accessToken, refresh_token: 'fixture-refresh', token_type: 'bearer',
      expires_in: 365 * 86400, expires_at: exp, user,
    },
  };
}

interface Answer { status: number; body: string; headers?: Record<string, string> }

const json = (status: number, body: unknown, headers?: Record<string, string>): Answer =>
  ({ status, body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

/** Upserts a PostgREST write's rows by `id`; rows without one are appended. Returns the rows. */
function applyWrite(tables: Record<string, Row[]>, table: string, method: string, url: URL, raw: string): Row[] {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter(
    (r): r is Row => typeof r === 'object' && r !== null,
  );
  const rows = (tables[table] ??= []);
  if (method === 'PATCH') {
    // An update by filter: `?id=eq.<id>` is the only shape the app's writers send.
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const patch = incoming[0] ?? {};
    const hit = rows.filter((r) => id !== undefined && String(r.id) === id);
    hit.forEach((r) => Object.assign(r, patch));
    return hit;
  }
  for (const r of incoming) {
    const at = r.id === undefined ? -1 : rows.findIndex((x) => x.id === r.id);
    if (at >= 0) rows[at] = { ...rows[at], ...r };
    else rows.push({ ...r });
  }
  return incoming;
}

/** One request in, one answer out: the whole server, testable without a socket. */
export function createFixtureHandler(opts: FixtureServerOptions = {}) {
  const realNow = opts.nowMs ?? Date.now();
  const storyNow = realNow - DAY_MS;
  const tables = buildFixtureTables(storyNow);
  tables.app_config = [];
  const { user, session } = fixtureSession(realNow);
  const log = opts.log ?? (() => {});

  function answer(method: string, url: URL, accept: string, body: string): Answer {
    const path = url.pathname;
    if (path.startsWith('/auth/v1/token')) {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'refresh_token') return json(200, session);
      if (grant === 'password') {
        let creds: { email?: string; password?: string } = {};
        try {
          creds = JSON.parse(body || '{}');
        } catch {
          // Unreadable: answered as a wrong password below.
        }
        if (creds.email?.trim().toLowerCase() === FIXTURE_EMAIL && creds.password === FIXTURE_PASSWORD) {
          log('auth signed in as the fixture owner');
          return json(200, session);
        }
        log('auth refused a password grant');
        return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      return json(400, { code: 400, error_code: 'unsupported_grant_type', msg: 'Unsupported grant type' });
    }
    if (path === '/auth/v1/user') return json(200, user);
    if (path === '/auth/v1/logout') return { status: 204, body: '' };
    if (path.startsWith('/rest/v1/')) {
      const table = path.replace(/^\/rest\/v1\//, '');
      if ((method === 'POST' || method === 'PATCH') && !table.startsWith('rpc/')) {
        const rows = applyWrite(tables, table, method, url, body);
        log(`write ${table} ${rows.length} row(s)`);
        const prefer = accept.includes('vnd.pgrst.object') ? rows[0] ?? null : rows;
        return json(201, prefer);
      }
      const a = answerRest(tables, method, url, accept);
      return { ...a, headers: { 'content-type': 'application/json', ...(a.headers ?? {}) } };
    }
    // Storage: nothing in the fixture holds a photo, so a signing request answers a path that
    // 404s, the app's own missing-photo branch. Uploads are accepted and dropped.
    if (path.startsWith('/storage/v1/object/sign/')) return json(200, { signedURL: '/storage/v1/object/missing' });
    if (path.startsWith('/storage/v1/object/') && method !== 'GET') return json(200, { Key: path });
    log(`unanswered ${method} ${path}`);
    return json(404, {});
  }

  return { answer, tables, storyNowMs: storyNow };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (d: string) => { s += d; });
    req.on('end', () => resolveBody(s));
    req.on('error', reject);
  });
}

export function startFixtureServer(port: number, opts: FixtureServerOptions = {}): Promise<Server> {
  const { answer } = createFixtureHandler(opts);
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    readBody(req)
      .then((body) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        const a = answer(req.method ?? 'GET', url, String(req.headers.accept ?? ''), body);
        res.writeHead(a.status, a.headers ?? {});
        res.end(a.status === 204 ? undefined : a.body);
      })
      .catch((e: unknown) => {
        opts.log?.(`error ${String(e)}`);
        res.writeHead(500);
        res.end();
      });
  });
  // Realtime opens a websocket; there is nothing to say on it.
  server.on('upgrade', (_req, socket) => socket.destroy());
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolveServer(server));
  });
}

// Run directly (never under jest, whose argv[1] is jest's own binary).
if (process.argv[1]?.endsWith('scripts/sim/fixtureServer.ts')) {
  const port = Number(process.argv[2] ?? DEFAULT_PORT);
  const log = (line: string) => console.log(`[fixture ${new Date().toISOString()}] ${line}`);
  startFixtureServer(port, { log })
    .then(() => log(`listening on http://127.0.0.1:${port} (the record ends yesterday)`))
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    });
}
