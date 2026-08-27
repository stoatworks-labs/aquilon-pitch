# CLAUDE.md — Aquilon Pitch

Short command reference. The model and the traps are in `AGENTS.md`; the evidence behind
every device fact is in `docs/NOTES.md`.

```bash
npm install
npm run dev          # vite, port 4362 in the fleet launch config
npm test             # vitest, 51 tests
npm run typecheck    # tsc -b
npm run build        # -> dist/, static
npm run build:lib    # -> lib-dist/, the single ESM file other repos vendor
npm run deploy       # cloudflare worker with static assets
```

## Rules that are not negotiable

- **`src/lib/` imports nothing outside itself.** No React, no DOM. It is written to be
  vendored into the other LivePremier tools.
- **`footprint()` floors.** It was measured. Four tests exist purely to break if someone
  changes it to `round`.
- **Never clamp an out-of-range ratio.** The device discards those writes; a clamped value is
  a number we invented.
- **No network calls.** The AWJ frames are printed, never sent.
- **`lib-dist/` is committed and must not go stale.** Change anything under `src/lib/`
  and you re-run `npm run build:lib` and commit the result in the same change.
  `lib-dist.test.ts` fails when the built bundle and the source disagree.
