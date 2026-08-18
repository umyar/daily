// Vercel compiles the functions with a tsconfig we don't control, and it has
// been observed compiling them without Node's type definitions — which made
// every `process.env` reference a build error that still shipped. Declaring the
// one global we need is module-scoped, so it works whatever `types` that config
// ends up using.
declare const process: { env?: Record<string, string | undefined> } | undefined

export function envValue(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined
  return process.env[name]
}
