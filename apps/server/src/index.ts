import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, getRoom, isRoomId, newRoomId, parseAction } from './rooms.ts'

const PORT = Number(process.env.PORT ?? 8787)
const WEB_DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url))
const MAX_BODY = 64 * 1024

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
  const url = new URL(req.url ?? '/', 'http://localhost')

  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    return await serveStatic(url.pathname, res)
  } catch (error) {
    console.error(error)
    send(res, 500, { error: 'server error' })
  }
})

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/api/room' && req.method === 'POST') {
    return send(res, 200, { id: newRoomId() })
  }

  const match = /^\/api\/room\/([^/]+)$/.exec(url.pathname)
  if (!match) return send(res, 404, { error: 'not found' })

  const id = match[1]
  if (!isRoomId(id)) return send(res, 400, { error: 'bad room id' })

  if (req.method === 'GET') {
    const state = getRoom(id)
    // Nothing new since the client's last poll — keep the response empty. A
    // request that names no version always gets the state.
    const since = url.searchParams.get('since')
    if (since !== null && Number(since) === state.version) {
      res.writeHead(204).end()
      return
    }
    return send(res, 200, state)
  }

  if (req.method === 'POST') {
    const body = await readBody(req)
    if (body === null) return send(res, 413, { error: 'body too large' })
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return send(res, 400, { error: 'bad json' })
    }
    const action = parseAction(parsed)
    if (!action) return send(res, 400, { error: 'bad action' })
    return send(res, 200, apply(id, action))
  }

  send(res, 405, { error: 'method not allowed' })
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

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': MIME['.json'], 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

server.listen(PORT, () => {
  console.log(`daily server on http://localhost:${PORT}`)
})
