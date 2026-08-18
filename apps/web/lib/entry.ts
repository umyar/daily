// Shared shell for the Vercel Function entry points. Each api/ file still
// declares its own literal `runtime` export, because Vercel reads route segment
// options by static analysis and a re-export can hide them.

import { envValue } from './env.js'
import { handleApi, type Store } from './roomApi.js'
import { redisStore } from './redisStore.js'

let store: Store | undefined

export async function serve(request: Request): Promise<Response> {
  try {
    store ??= redisStore()
  } catch (error) {
    // Almost always a missing Redis binding. Say so plainly rather than
    // returning an opaque 500 the browser reports as "offline".
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  return handleApi(request, { store, hostPassword: envValue('HOST_PASSWORD') })
}
