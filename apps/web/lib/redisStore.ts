// Production. Vercel Functions share no memory between invocations, so the room
// lives in Redis and the compare-and-swap has to be genuinely atomic.

import Redis from 'ioredis'
import { envEndingWith, envNames, envValue } from './env.js'
import { missingState, ROOM_TTL_SECONDS, type RoomState } from './roomState.js'
import type { Store } from './roomApi.js'

// Marketplace integrations let you pick a variable prefix, so match the ending
// rather than an exact name.
const URL_ENDINGS = ['REDIS_URL', 'REDIS_URI', 'REDIS_CONNECTION_STRING']

// Runs server-side inside Redis, so the read of `version` and the write that
// depends on it can't be interleaved by another request.
const CAS = `
local current = redis.call('HGET', KEYS[1], 'version')
if current == false then
  if ARGV[1] ~= '0' then return 0 end
else
  if current ~= ARGV[1] then return 0 end
end
redis.call('HSET', KEYS[1], 'state', ARGV[2], 'version', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`

// Module scope, so a warm function instance reuses one connection instead of
// dialling Redis on every request.
let shared: Redis | undefined

export function redisStore(): Store {
  const url = envEndingWith(URL_ENDINGS)
  if (!url) throw new Error(describeMissing())

  // Resolved per command rather than captured once. Closing over the client
  // would pin a dead one for the lifetime of the instance, which is exactly
  // what `dropSharedConnection` exists to undo.
  const connect = () =>
    (shared ??= new Redis(url, {
      // A hung dial should surface as a failed request, not a stalled function.
      connectTimeout: 5000,
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
    }))
  const key = (id: string) => `room:${id}`

  return {
    async read(id) {
      const stored = await connect().hget(key(id), 'state')
      if (stored === null) return missingState()
      return JSON.parse(stored) as RoomState
    },

    async write(id, expectedVersion, next) {
      const ok = await connect().eval(
        CAS,
        1,
        key(id),
        String(expectedVersion),
        JSON.stringify(next),
        String(next.version),
        String(ROOM_TTL_SECONDS),
      )
      return Number(ok) === 1
    },
  }
}

// ioredis redials on its own, so dropping the client is not what makes recovery
// possible — but that redial backs off toward two seconds, and it runs for as
// long as the warm instance lives even when the server is never coming back.
// Letting go costs nothing and turns the next request into a clean dial:
// measured against a server that had just returned, 2ms rather than 216ms, and
// the gap widens the longer the outage ran.
export function dropSharedConnection(): void {
  const dead = shared
  shared = undefined
  // `disconnect`, not `quit`: QUIT waits for a reply from a server that by
  // definition is not answering, and we want the retry loop abandoned anyway.
  dead?.disconnect()
}

// Socket-level failures. `code` is absent from most of what ioredis hands back
// — an exhausted retry loop reports itself rather than the errno underneath —
// so this is the rarer shape, not the usual one.
const CONNECTION_ERRNOS = [
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
]

// The server answered and refused us. A different cause, but the same
// consequence for the caller, and equally not something a retry will fix.
const REFUSED_REPLY = /^(WRONGPASS|NOAUTH|NOPERM|ERR max number of clients)/

// A public-facing explanation when `error` means the store is unreachable, and
// undefined when it is an ordinary bug that must not be dressed up as an
// outage. Never echoes the connection string: only the kind of failure and the
// scheme-and-host shape, which identifies the provider without its credentials.
export function connectionFailure(error: unknown): string | undefined {
  const kind = connectionErrorKind(error)
  if (!kind) return undefined

  const target = safeShape(envEndingWith(URL_ENDINGS))
  return (
    `Storage unavailable (${kind}). ` +
    (target ? `${target} is not answering. ` : '') +
    'Check that the Redis instance still exists and that the connection string ' +
    'in this deployment still points at it.'
  )
}

function connectionErrorKind(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined

  // What an unreachable server actually produces: ioredis spends
  // `maxRetriesPerRequest` and then reports its own error, so this is the
  // common case rather than the exotic one.
  if (error.name === 'MaxRetriesPerRequestError') return error.name
  if (/Connection is closed|Stream isn't writeable/i.test(error.message)) {
    return 'connection closed'
  }

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && CONNECTION_ERRNOS.includes(code)) return code

  if (REFUSED_REPLY.test(error.message)) return 'connection refused by the server'

  return undefined
}

// Names only, and only Redis-ish ones — enough to see what an integration
// actually injected without printing anything sensitive on a public endpoint.
// Values are reduced to scheme and host, which identifies the provider; the
// credentials inside a connection string are never echoed.
function describeMissing(): string {
  const related = envNames().filter((name) => /REDIS|UPSTASH|\bKV_/.test(name))

  if (!related.length) {
    return (
      'No Redis connection string. Set a variable whose name ends with ' +
      `${URL_ENDINGS.join('/')} to a redis:// or rediss:// URL, then redeploy so ` +
      'the function picks it up.'
    )
  }

  const described = related
    .map((name) => {
      const shape = safeShape(envValue(name))
      return shape ? `${name} (${shape})` : name
    })
    .join(', ')

  return (
    `No usable Redis connection string. Redis-related variables set: ${described}. ` +
    `This app needs one whose name ends with ${URL_ENDINGS.join('/')} and whose value ` +
    'is a redis:// or rediss:// URL.'
  )
}

// Scheme and host only. Anything that does not parse as a URL is withheld
// entirely rather than risk printing a secret.
function safeShape(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return `${parsed.protocol}//${parsed.username || parsed.password ? '***@' : ''}${parsed.host}`
  } catch {
    return undefined
  }
}
