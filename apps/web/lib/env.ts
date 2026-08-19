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

export function envNames(): string[] {
  if (typeof process === 'undefined' || !process.env) return []
  return Object.keys(process.env)
}

// Marketplace integrations let you pick an environment variable prefix, so the
// injected names are not fixed. Match the documented endings rather than exact
// names, preferring an exact hit when there is one.
export function envEndingWith(endings: string[]): string | undefined {
  for (const ending of endings) {
    const exact = envValue(ending)
    if (exact) return exact
  }
  for (const name of envNames()) {
    if (endings.some((ending) => name.endsWith(ending))) {
      const value = envValue(name)
      if (value) return value
    }
  }
  return undefined
}
