// One implementation of the room API. The Vercel function and the local dev
// server both hand requests here — only the Store behind it differs, so the two
// environments can't drift apart.

import { isHost, issueToken, passwordMatches, suppliedPassword, TOKEN_TTL_MS } from './hostAuth.ts'
import {
  isRoomId,
  missingState,
  newRoomId,
  openState,
  parseAction,
  reduce,
  type RoomState,
} from './roomState.ts'

export type Store = {
  read(id: string): Promise<RoomState>
  // Writes only if the stored version is still `expectedVersion`. False means
  // someone else's write landed first and we should re-read and retry.
  write(id: string, expectedVersion: number, next: RoomState): Promise<boolean>
}

export type ApiConfig = {
  store: Store
  hostPassword: string | undefined
}

const MAX_BODY = 64 * 1024
const WRITE_ATTEMPTS = 5

export async function handleApi(request: Request, config: ApiConfig): Promise<Response> {
  const { store, hostPassword } = config
  if (!hostPassword) {
    return json(
      { error: 'No HOST_PASSWORD configured. Sessions cannot be started until it is set.' },
      503,
    )
  }

  const url = new URL(request.url)

  // Trade the password for a short-lived token, so the password itself never
  // has to live on the host's device.
  if (url.pathname === '/api/session') {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
    if (!(await passwordMatches(suppliedPassword(request), hostPassword))) {
      return json({ error: 'wrong password' }, 401)
    }
    return json({ token: await issueToken(hostPassword), expiresAt: Date.now() + TOKEN_TTL_MS })
  }

  const id = url.searchParams.get('id')

  // Opening a session is the host's privilege, so this is the one route that
  // needs the credential before it will do anything at all.
  if (request.method === 'POST' && !id) {
    if (!(await isHost(request, hostPassword))) return json({ error: 'wrong password' }, 401)
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const fresh = newRoomId()
      const state = { ...openState(), version: 1 }
      // A brand new room is at version 0 until someone claims it; if the CAS
      // fails we drew an id that already exists and should just draw another.
      if (await store.write(fresh, 0, state)) return json({ id: fresh })
    }
    return json({ error: 'could not allocate a room' }, 503)
  }

  if (!id) return json({ error: 'missing room id' }, 400)
  if (!isRoomId(id)) return json({ error: 'bad room id' }, 400)

  if (request.method === 'GET') {
    const state = await store.read(id)
    // Nothing new since the client's last poll — keep the response empty. A
    // request that names no version always gets the state.
    const since = url.searchParams.get('since')
    if (since !== null && Number(since) === state.version) {
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
    }
    return json(state)
  }

  if (request.method === 'POST') {
    const body = await readBody(request)
    if (body === null) return json({ error: 'body too large' }, 413)

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return json({ error: 'bad json' }, 400)
    }

    const action = parseAction(parsed)
    if (!action) return json({ error: 'bad action' }, 400)
    if (action.type === 'close' && !(await isHost(request, hostPassword))) {
      return json({ error: 'wrong password' }, 401)
    }

    // Read, reduce, then write only if nothing moved underneath us. A lost race
    // re-reduces against the winner's state, which is how a second simultaneous
    // draw turns into a no-op instead of burning another question.
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      const state = await store.read(id)
      const next = reduce(state, action)
      if (!next) return json(state)
      next.version = state.version + 1
      if (await store.write(id, state.version, next)) return json(next)
    }
    return json({ error: 'room too busy' }, 503)
  }

  return json({ error: 'method not allowed' }, 405)
}

export function blankRoom(): RoomState {
  return missingState()
}

async function readBody(request: Request): Promise<string | null> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY) return null
  const text = await request.text()
  return text.length > MAX_BODY ? null : text
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
