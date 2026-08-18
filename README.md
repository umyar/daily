# Daily

A standup question randomizer a team shares over one link. Everyone adds their
questions from their own device, anyone hits Done, and anyone can spin — the
draw plays out on every screen at once, landing on the same question.

## Running it

```bash
pnpm install
pnpm dev
```

That starts two processes: the Vite dev server on `:5173` (which proxies `/api`)
and the state server on `:8787`.

For production, build the client and let the server host it:

```bash
pnpm build && pnpm start
```

One process on `:8787` then serves both the app and the API. Set `PORT` to move it.

## How the sharing works

The server holds every live room in memory and is the only thing that picks a
winner. Clients poll `GET /api/room/:id?since=<version>` once a second and get a
`204` when nothing has changed; actions go out as `POST /api/room/:id` and come
back with the fresh state, so whoever clicked sees their own change instantly
and everyone else within a poll.

Two people clicking Randomize at the same moment would otherwise burn two
questions. Each draw carries the count the clicker believed was current
(`{"type":"draw","expect":3}`), and the server drops the ones that no longer
match — the losers just receive the winner that did land.

Rooms live in memory, so a restart clears them, and untouched rooms are swept
after 12 hours. For a tool that starts fresh each morning that's usually the
right trade; if you need rooms to outlive restarts, move the `Map` in
`apps/server/src/rooms.ts` behind Redis or SQLite.

## Layout

| Path | What's in it |
| --- | --- |
| `apps/web` | React client — collect screen, draw screen, polling transport |
| `apps/server` | Zero-dependency Node server — room state, reducer, static hosting |
