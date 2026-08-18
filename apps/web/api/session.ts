import { serve } from '../lib/entry.ts'

export const runtime = 'nodejs'

export function GET(request: Request) {
  return serve(request)
}

export function POST(request: Request) {
  return serve(request)
}
