// Local development only. Production runs the same handler as a Vercel Function
// (apps/web/api/room.ts) — this process exists so `pnpm dev` needs no Redis and
// no Vercel CLI. Both paths share lib/roomApi.ts, so they can't drift.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from '../../web/lib/roomApi.js'
import { memoryStore } from '../../web/lib/memoryStore.js'

// HOST_PASSWORD lives in the repo-root .env, which is gitignored. Production
// reads the same name from Vercel's environment instead.
const passwordFromEnvironment = process.env.HOST_PASSWORD
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)))
} catch {
  console.warn('No .env found — set HOST_PASSWORD there to start sessions locally.')
}
// An explicitly exported variable outranks the dotfile.
if (passwordFromEnvironment) process.env.HOST_PASSWORD = passwordFromEnvironment

const PORT = Number(process.env.PORT ?? 8787)
const WEB_DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url))
const MAX_BODY = 64 * 1024

const store = memoryStore()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  try {
    if (url.pathname === '/api/room' || url.pathname === '/api/session') {
      const body = await readBody(req)
      if (body === null) {
        res.writeHead(413, { 'content-type': MIME['.json'] })
        res.end(JSON.stringify({ error: 'body too large' }))
        return
      }
      const config = { store, hostPassword: process.env.HOST_PASSWORD }
      const response = await handleApi(toRequest(req, url, body), config)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(response.status === 204 ? undefined : Buffer.from(await response.arrayBuffer()))
      return
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': MIME['.json'] })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    return await serveStatic(url.pathname, res)
  } catch (error) {
    console.error(error)
    res.writeHead(500, { 'content-type': MIME['.json'] })
    res.end(JSON.stringify({ error: 'server error' }))
  }
})

function toRequest(req: IncomingMessage, url: URL, body: string): Request {
  const method = req.method ?? 'GET'
  return new Request(url, {
    method,
    headers: Object.entries(req.headers).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value] as [string, string]] : [],
    ),
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  })
}

async function serveStatic(pathname: string, res: ServerResponse) {
  const file = await readStatic(pathname)
  if (file) {
    res.writeHead(200, {
      'content-type': MIME[extname(file.path)] ?? 'application/octet-stream',
      // Vite fingerprints everything under /assets, so it can be cached hard.
      'cache-control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    res.end(file.body)
    return
  }

  // A missing file with an extension is a bad asset URL, not a route. Saying so
  // beats handing back HTML the browser will refuse to parse as JS or CSS.
  if (extname(pathname)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  // Any other path is a client route (/r/ABC123) — hand back the shell.
  const shell = await readStatic('/index.html')
  if (!shell) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Web app not built yet. Run: pnpm build')
    return
  }
  res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' })
  res.end(shell.body)
}

async function readStatic(pathname: string) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
  if (rel.split(/[/\\]/).includes('..')) return null
  const path = join(WEB_DIST, rel || 'index.html')
  if (!path.startsWith(WEB_DIST.endsWith(sep) ? WEB_DIST : WEB_DIST + sep)) return null
  try {
    return { path, body: await readFile(path) }
  } catch {
    return null
  }
}

function readBody(req: IncomingMessage) {
  return new Promise<string | null>((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

server.listen(PORT, () => {
  console.log(`daily dev server on http://localhost:${PORT}`)
})
