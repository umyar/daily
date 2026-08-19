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

  shared ??= new Redis(url, {
    // A hung dial should surface as a failed request, not a stalled function.
    connectTimeout: 5000,
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
  })
  const redis = shared
  const key = (id: string) => `room:${id}`

  return {
    async read(id) {
      const stored = await redis.hget(key(id), 'state')
      if (stored === null) return missingState()
      return JSON.parse(stored) as RoomState
    },

    async write(id, expectedVersion, next) {
      const ok = await redis.eval(
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
