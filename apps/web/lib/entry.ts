// Shared shell for the Vercel Function entry points. Each api/ file still
// declares its own literal `runtime` export, because Vercel reads route segment
// options by static analysis and a re-export can hide them.

import { envValue } from './env.js'
import { handleApi, type Store } from './roomApi.js'
import { connectionFailure, dropSharedConnection, redisStore } from './redisStore.js'

// Same hazard as lib/env.ts: the config Vercel compiles these functions with is
// not ours, and has been seen without the type definitions that declare this.
// Declaring the one member we use is module-scoped, so it works either way.
declare const console: { error(...args: unknown[]): void }

let store: Store | undefined

export async function serve(request: Request): Promise<Response> {
  try {
    store ??= redisStore()
  } catch (error) {
    // Almost always a missing Redis binding. Say so plainly rather than
    // returning an opaque 500 the browser reports as "offline".
    return json({ error: (error as Error).message }, 503)
  }

  try {
    return await handleApi(request, { store, hostPassword: envValue('HOST_PASSWORD') })
  } catch (error) {
    // A connection string that is present but names a server that is gone gets
    // past the check above — `redisStore` reads the variable, it does not dial
    // — and fails here instead, on the first request that actually touches
    // Redis. Unhandled, that is the plain-text 500 the 503 above exists to
    // avoid, arriving one step later.
    const unavailable = connectionFailure(error)
    if (unavailable) {
      // ioredis does redial on its own, so this is not what makes recovery
      // possible — but its backoff climbs toward two seconds, and it keeps
      // retrying in the background for as long as the instance stays warm.
      // Letting go turns the next request into a clean dial instead.
      dropSharedConnection()
      return json({ error: unavailable }, 503)
    }

    // Anything else is a bug, not an outage. Still JSON, so the client has
    // something to show, but not labelled as something it can wait out.
    console.error(error)
    return json({ error: 'server error' }, 500)
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
