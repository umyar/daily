# Daily

A standup question randomizer a team shares over one link. The host opens a
session and shares the link; everyone adds questions from their own device,
anyone hits Done, and anyone can spin — the draw plays out on every screen at
once, landing on the same question. When the host ends the session it goes
away for everybody.

## Running it

```bash
pnpm install
pnpm dev
```

That starts two processes: the Vite dev server on `:5173` (which proxies `/api`)
and a local state server on `:8787` that keeps rooms in memory. No Redis and no
Vercel CLI needed to work on the app.

Starting a session needs `HOST_PASSWORD`. Copy `.env.example` to `.env` and put
a value there — `.env` is gitignored. An exported `HOST_PASSWORD` in the shell
outranks the file, which is handy for testing with a throwaway value.

## Deploying

Production is Vercel, serving the built client and one function at
`apps/web/api/room.ts`. The project's root directory is `apps/web`, which is why
`api/` and `lib/` live there.

Vercel Functions share no memory between invocations, so production keeps rooms
in Upstash Redis instead. Add it once from the Vercel dashboard under Storage —
it injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into the
project. Without them the API answers 503 with a message saying exactly that,
rather than failing in a way the client can only report as "offline".

`HOST_PASSWORD` also has to be set in the Vercel project's environment
variables — it is both the password and the token signing key. Deliberately no `VITE_` prefix: Vite inlines anything so prefixed
into the public client bundle, which would publish the credential to everyone
who loads the page.

## Who can do what

Opening a session and ending one are the host's alone. Everything else — adding
questions, hitting Done, spinning — needs only the link. That is the point of
the link, and the reason the password guards the lifecycle rather than the
contents.

The host posts the password to `/api/session` once and gets back a signed token
that expires after eight hours; only the token is kept, in `localStorage`. The
password is never stored, and it stops working as a credential on its own — the
room endpoints accept the token and nothing else. A borrowed device therefore
leaks at most the rest of a working day, not a standing credential.

Tokens are HMAC-SHA256 over a payload holding only the expiry, signed with
`HOST_PASSWORD` itself. That means no session storage to keep (Vercel Functions
share none anyway, and Redis-backed sessions would cost commands on every host
action), and rotating the password invalidates every outstanding token for free.
Both the password check and the signature check hash their inputs first, so
neither the length of a guess nor the position of its first wrong character is
timeable.

An expired token is kept rather than deleted. It is useless as a credential, but
it still marks the device as the host's, so ending a stale session asks for the
password again instead of quietly hiding the control as though this were a
participant's browser.

A session is `open`, `closed`, or `missing`. The reducer refuses every action
unless the session is `open`, so ending one locks it for everybody at the same
moment, including anyone who already had the page loaded. Their next poll
returns `closed` and the app says so.

## A build constraint worth knowing

Relative imports under `apps/web` are written with a `.js` extension even though
the files on disk are `.ts` — `import { handleApi } from './roomApi.js'`.

Vercel compiles the functions with its own `tsc` invocation, using a config this
repo does not control. That config emits, and TypeScript refuses
`allowImportingTsExtensions` alongside emit, so a `.ts` specifier is a build
error there. Worse, that error does not fail the deployment: Vercel prints it,
emits broken output anyway, and the functions then die at runtime with
`FUNCTION_INVOCATION_FAILED`. Writing `.js` sidesteps it — TypeScript resolves
the specifier to the `.ts` source, and the emitted JavaScript points at the
emitted JavaScript.

That same config has been seen compiling without Node's type definitions, which
is why `lib/env.ts` declares the one global it needs instead of reaching for
`process` directly.

Two consequences:

- `pnpm build` runs `tsc -p tsconfig.api.json` before `vite build`, so a type
  error in `api/` or `lib/` fails the build here rather than shipping something
  that only breaks in production.
- Node's own type stripping takes `./roomApi.js` literally and would look for a
  file that was never written, so the dev server registers a resolve hook
  (`apps/server/register.mjs`) mapping those specifiers back to `.ts`.

## How the sharing works

Clients poll `GET /api/room?id=<room>&since=<version>` once a second and get a
`204` when nothing has changed; actions go out as `POST /api/room?id=<room>` and
come back with the fresh state, so whoever clicked sees their own change
instantly and everyone else within a poll.

Two people clicking Randomize at the same moment would otherwise burn two
questions. Each draw carries the count the clicker believed was current
(`{"type":"draw","expect":3}`), and the server drops the ones that no longer
match — the losers just receive the winner that did land.

The request handler lives in `apps/web/lib/roomApi.ts` and is shared by the
Vercel function and the local dev server; only the storage behind it differs.
That seam matters: an earlier version had two separate server implementations,
and production broke precisely because they diverged. Storage is a two-method
`Store` — read, and write-if-the-version-still-matches. In memory that check is
trivial, since Node serialises the requests anyway; on Redis it is a Lua script,
so the read of `version` and the write depending on it cannot interleave.

Rooms expire 12 hours after their last write. If a standup needs to outlive
that, the TTL is `ROOM_TTL_SECONDS` in `apps/web/lib/roomState.ts`.

## Layout

| Path | What's in it |
| --- | --- |
| `apps/web/src` | React client — collect screen, draw screen, polling transport |
| `apps/web/lib` | Shared state machine, request handler, and the two stores |
| `apps/web/api` | The Vercel Function entry point |
| `apps/server` | Local dev server — static hosting plus the shared handler |
