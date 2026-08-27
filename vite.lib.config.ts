/**
 * The build that produces the copy other tools vendor.
 *
 *     npm run build:lib   ->   dist-lib/aquilon-pitch-engine.js
 *
 * One readable ESM file, no minification, comments kept. That is deliberate on
 * every count: the vendored copy is read by whoever is debugging the tool that
 * borrowed it, and a minified blob in someone else's `src/vendor/` is a dead
 * end. It is also what makes the hash manifests in the consuming repos mean
 * something — a reviewer can diff the file and see actual code.
 *
 * The engine has no dependencies, so there is nothing to externalise and
 * nothing for a consumer to install. That is the whole reason it is worth
 * copying rather than publishing.
 */

import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    minify: false,
    // No sourcemap: it would point at paths inside THIS repo, which do not
    // exist in the repo doing the vendoring.
    sourcemap: false,
    target: 'es2022',
    lib: {
      entry: new URL('./src/lib/index.ts', import.meta.url).pathname,
      formats: ['es'],
      fileName: () => 'aquilon-pitch-engine.js',
    },
  },
  define: {
    __ENGINE_VERSION__: JSON.stringify(pkg.version),
  },
})
