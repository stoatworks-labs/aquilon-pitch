# Aquilon Pitch

> **AI-assisted project.** This codebase was created with [Claude Code](https://claude.com/claude-code)
> (Anthropic), directed and reviewed by a human author. The arithmetic is not taken from the
> user manual — it was **driven into a running AW LivePremier Simulator 6.2.73** and read back
> off the wire. Fourteen ratio/raster pairs were written to a real output's `pitchRatioH`/`V`
> and the resulting `pitchedWidth`/`pitchedHeight` recorded; those observations are pinned as
> tests, and they are what settled the direction of the ratio, the field's range, its
> precision, and the fact that the device **floors** the canvas footprint rather than rounding
> it. **No pitch-compensated screen built from this has been driven onto real LED walls**, and
> nothing here has touched physical Aquilon hardware — the simulator runs the same
> `nlc-platform` web application and the same object model, but it is not the switcher.

Work out the pitch compensation an Analog Way **LivePremier** needs when one screen spans LED
walls of different pixel pitches.

Type each output group's raster and its pitch — or its measured size, and let the pitch fall
out. Get the **H Ratio** and **V Ratio** to type into Web RCS, the canvas footprint each group
will take, the screen canvas that results, and the millimetres the device's three-decimal
field costs you at the far edge of each wall.

Runs entirely in the browser. No account, no backend, nothing uploaded — a client's set design
has nowhere to leak to.

---

## The problem it exists for

A screen spanning a 2.6 mm main wall and a 5.2 mm side wall has two output groups with half
the pixel density of each other. Drive them from one canvas at 1:1 and a layer crossing the
join changes physical size the instant it crosses: same pixels, twice the millimetres.

LivePremier's answer is **pitch compensation** — a per-output-group ratio that says how much
canvas each group's raster is worth. The manual gives it four sentences:

> Some Screens using multiple outputs can have outputs with different pitches, especially LED
> video walls. […] The reference output group should use a 1:1 pitch. In Pitch, set the H and
> V ratio of the output group compared to the reference output group.

What it does not say is which way round the ratio goes, what the field will hold, or what
happens when the answer is not a round number. All three matter, and all three are in here.

## Which way the ratio goes

**The ratio multiplies the group's raster to give its footprint on the canvas.** A coarser
wall gets a number above 1.000.

Verified: `pitchRatioH = 2000` written to output 1 of a running simulator, followed by
`xUpdate = true`, turned that output's read-only `pitchedWidth` × `pitchedHeight` from
1920 × 1080 into **3840 × 2160**. The 1920-pixel-wide output is handed 3840 canvas pixels and
resamples them down into its own raster — which is exactly right for a wall whose pixels are
twice as far apart.

## Make the finest wall the reference

The tool defaults to it and will argue if you override it.

The ratio scales a raster **up** into canvas pixels, so the reference should be the group with
the most pixels per millimetre. Every other group then lands above 1.000, is given more canvas
than it has real pixels, and scales **down** — a resize a video processor does well and nobody
sees.

Pick a coarse group as the reference instead and the fine wall lands below 1.000. It is handed
*fewer* canvas pixels than it has real ones and spends the whole show upscaling — visibly, on
the best-pitch surface in the room. The tool says so when you do it.

## What the field will actually hold

| | |
|---|---|
| Stored as | integer thousandths — `1000` is 1.000 |
| Range | **0.100 to 10.000** |
| Precision | three decimals, and no more |
| Out of range | the write is **discarded**, not clamped |
| Where | Preconfig > Canvas > *select output group* > Pitch |
| Labels | **H Ratio** and **V Ratio** — two separate fields, one per axis |

That "discarded, not clamped" line is the one worth knowing. Writing 10001 to a field holding
1001 left it holding 1001; so did writing 99. The device says nothing, and the operator is
looking at a field that still reads whatever was in it before. So this tool **refuses** an
out-of-range ratio rather than quietly clamping it to 10.000 and reporting a number the
switcher will never take.

## The device floors, and it costs you a pixel

    pitchedWidth = floor(rasterWidth × pitchRatioH / 1000)

Floor, not round — measured, four separate times:

| raster | ratio | exact | device gave | rounding would give |
|---|---|---|---|---|
| 1080 | 1.234 | 1332.72 | **1332** | 1333 |
| 1920 | 1.001 | 1921.92 | **1921** | 1922 |
| 1080 | 0.333 | 359.64 | **359** | 360 |
| 1920 | 1.234 | 2369.28 | **2369** | 2369 |

Combined with the three-decimal field, that is where the drift comes from. A 2.6 mm reference
and a 4.0 mm wall want a ratio of 1.53846…; the field holds 1.538; across a 1920-pixel raster
that is 1.85 canvas pixels short, which is **4.8 mm of real wall** at the far edge. The tool
reports that number per group per axis, because it is the number that decides whether the
rounding matters or not.

## What you get

- **The two ratios per output group**, ready to type, at the precision the field holds.
- **The canvas footprint** each group takes, computed the device's way.
- **The screen canvas** the design needs — and a plain statement when a blocked group means
  it is not achievable as specified.
- **The drift**, in canvas pixels and in millimetres on the wall.
- **The screen drawn twice** — the walls in the room above, the canvas below, at the same
  scale, so a mapping that is not uniform is visible rather than inferred.
- **A CSV** for the show folder, and the **AWJ frames** a script would send.

## What it will not do

**It has no socket and will not grow one.** A pitch change is a preconfig change on a live
show machine. The AWJ frames are printed for you to use as you see fit; nothing here connects
to a switcher, which is what makes it always safe to open. If you do script it: `xUpdate` is
not optional — writing a ratio alone moves the command value and leaves the canvas exactly
where it was, verified.

## Running it

```bash
npm install
npm run dev
```

```bash
npm test
```

Build with `npm run build`; `dist/` is a static site, deployed as a Cloudflare Worker with
static assets (`npm run deploy`).

## The engine is meant to be borrowed

`src/lib/` has no React, no DOM, no dependencies and no imports outside itself. It is
written to be vendored into the other LivePremier tools in the fleet, the way
`awj-surface`'s core is vendored into `livepremier-plus`.

```bash
npm run build:lib      # -> lib-dist/aquilon-pitch-engine.js
```

One readable ESM file, unminified, comments intact — a minified blob in someone else's
`src/vendor/` is a dead end, and the hash manifests in the consuming repos only mean
something if a reviewer can diff actual code. `src/lib/index.ts` is the barrel that
defines the public surface; adding an export there widens the contract.

`lib-dist/` is generated but **committed**, so a fresh clone can hand a consumer the file
without building first. `lib-dist.test.ts` loads the built bundle beside the source and
demands the same answers, so a stale copy fails the suite rather than quietly disagreeing
with every tool that borrowed it.

## Status

**Alpha.** The device arithmetic is measured and pinned by 51 tests. The UI has been driven
end to end in a browser. What has *not* happened: nothing has run against physical Aquilon
hardware, and no screen configured from these numbers has been played out onto real LED walls
and looked at. The simulator is the same web application and object model as the switcher, and
it is still not the switcher.

## Licence

MIT.
