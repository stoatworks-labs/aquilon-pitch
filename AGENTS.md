# AGENTS.md — bringing an LLM up to speed on Aquilon Pitch

Orientation for an AI assistant (or a new human) picking this up cold. `CLAUDE.md` is the
command reference; `docs/NOTES.md` holds the evidence for every claim about the device.

---

## 1. What this is

A **LivePremier pitch compensation calculator**. Browser-only, no backend: React + TypeScript
+ Vite, built to a static `dist/` and served by a Cloudflare Worker. State lives in
`localStorage` and in the URL hash.

It answers one question: when one Aquilon screen spans LED walls of different pixel pitches,
what goes in each output group's **H Ratio** and **V Ratio** fields, and what does the answer
cost.

## 2. Layout

```
src/
  types.ts                  the domain. All lengths are MILLIMETRES
  lib/device.ts             what a LivePremier does. Every constant is MEASURED — read it
  lib/pitch.ts              THE ENGINE. ratio = pitch_group / pitch_reference, twice
  lib/awj.ts                instructions, CSV, and the AWJ frames (printed, never sent)
  lib/urlstate.ts           localStorage + shareable hash
  components/CanvasViz.tsx  the room above, the canvas below, same scale
  components/ui.tsx         Field / Panel / Segmented / Stat / CopyButton
  App.tsx                   wiring and all the state
```

## 3. The relation everything derives from

```
ratio = pitch_of_this_group / pitch_of_the_reference_group
```

Applied once per axis. That is the entire calculation, and it is not the work. The work is
everything between that clean number and what the device will hold — three decimals, a range
of 0.100 to 10.000, and a `floor()` on the footprint — which is what `lib/device.ts` and the
`audit()` pass in `lib/pitch.ts` exist for.

## 4. Traps

### The ratio MULTIPLIES the raster

`pitchedWidth = floor(raster × ratio)`. A **coarser** wall gets a ratio **above** 1.000. This
is measured, not inferred (`docs/NOTES.md`), and it is the thing everyone gets backwards on
first contact — including the manual, by omission.

### The reference must be the finest pitch, or something upscales

Ratios below 1.000 hand a group fewer canvas pixels than it has real ones. The device accepts
it — the field goes down to 0.100 — and the wall softens. `pickReference` defaults to the
finest and `audit()` warns when an override forces the other case. Do not "fix" the warning by
removing it.

### Clamping is wrong

An out-of-range write is **discarded** by the device, silently. Clamping 15.385 to 10.000 and
displaying it would report a value the switcher never took, while the operator stares at a
field still holding its old number. `outOfRange` is a refusal, not a bound.

### NaN is not an empty field

`num()` in `App.tsx` maps unparseable input to `0`, and `resolvePitch` returns `null` for
anything that cannot make a pitch. Let NaN in and selecting a raster to retype it turns the
whole results column into `NaN`.

### `src/lib/` is vendorable — keep it that way

No React, no DOM, no imports outside `src/lib` and `src/types.ts`. It is meant to be lifted
into `livepremier-plus`, `negative-space` or `pixel-peeker` wholesale, the way `awj-surface`'s
core is vendored into `livepremier-plus`.

## 5. Verifying against the simulator

`AW LivePremier Simulator.app` on this Mac serves HTTP on 3000 and AWJ on 10606. The device
model comes from `GET /api/stores/device` (it is ~120 MB — do not print it). Writes go over
the WebSocket at the origin root as
`{"channel":"DEVICE","data":{"path":["device",...],"value":v}}`, and **`xUpdate` must be
written true afterwards** or the status never moves. `docs/NOTES.md` has the exact paths.

Writing to the SIMULATOR is fine. Writing to a real Aquilon is not — that device is read-only
without asking first.
