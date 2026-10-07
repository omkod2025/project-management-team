// Run database adapters directly under Node, with the same @ alias as Next.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = new URL('../../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const url = specifier.startsWith('@/') ? new URL(specifier.slice(2), source) : new URL(specifier, context.parentURL);
      if (url.protocol === 'file:') {
        const path = fileURLToPath(url);
        for (const suffix of ['.ts', '.tsx', '/index.ts']) {
          if (existsSync(path + suffix)) return { url: pathToFileURL(path + suffix).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
