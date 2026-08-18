import { registerHooks } from 'node:module'

// Shared source under apps/web writes relative imports as `./thing.js`, because
// that is what Vercel's TypeScript build emits and resolves against. Node's own
// type stripping takes the specifier literally and would look for a `.js` that
// was never written, so map those back to the `.ts` that is actually on disk.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && specifier.endsWith('.js')) {
      try {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context)
      } catch {
        // Fall through: a genuine .js file may well exist.
      }
    }
    return nextResolve(specifier, context)
  },
})
