# Notes

Things learned building this that are not obvious from the code, and the evidence behind them.

---

## How the device facts were obtained

Two sources, both from `AW LivePremier Simulator 6.2.73`, which was already running on
`127.0.0.1:3000` (HTTP) / `10606` (AWJ).

### 1. The generated attribute table

The simulator ships its client bundle **unminified, with generator comments** — see
[aw platform split nlc mng](https://github.com/stoatworks-labs/fleet-notes) in fleet-notes.

```
/Applications/AW LivePremier Simulator.app/Contents/MacOS/LIVEPREMIER_6_2_73/
  ressources/AW_APPS/webapp-bundle/dist/client/app.<hash>.js
```

Grepping it for `pitchRatio` finds the table `aw-generate-do` emitted:

```js
const CMD_ATTRIBUTES = {
  PP: {
    pitchRatioH: { min: 100, max: 10000, def: 1000, type: 'int', readOnly: false },
    pitchRatioV: { min: 100, max: 10000, def: 1000, type: 'int', readOnly: false },
    ...
```

and, a few modules along, the scale factor with the vendor's own comment on it:

```js
/** Rapport d'échelle pour réglage Pitch de l'AOI (1000 = 1) */
const AOI_SCREEN_PITCH_SCALE_RATIO = 1000;
```

The UI labels come from the same file: `createEasyPPProps(..., 'H Ratio', ...)` and
`'V Ratio'`, rendered under an `<h4>Pitch</h4>` in
`pixelspaces-output-pitch-container.jsx`.

### 2. Driven on the wire

The transport is the one [livepremier-plus](https://github.com/stoatworks-labs/livepremier-plus)
documents: one WebSocket to the origin root, frames of
`{"channel":"DEVICE","data":{"path":[...],"value":...}}`, with the full snapshot over
`GET /api/stores/device`. Writing a property **is** the command.

```
device/outputList/items/<key>/canvas/cmd/pp/pitchRatioH   <- 2000
device/outputList/items/<key>/canvas/cmd/pp/xUpdate       <- true
```

then read back `.../canvas/status/pp/pitchedWidth`.

---

## What that settled

### The ratio multiplies. It does not divide.

`pitchRatioH = 2000` on a 1920×1080 output produced `pitchedWidth/Height` of **3840×2160**.

This is the single fact the whole tool turns on and the one the manual does not state. A
coarser wall — fewer pixels per millimetre — takes a ratio **above** 1.000, is allotted more
canvas than it has real pixels, and downsamples.

### `xUpdate` is not optional

Writing `pitchRatioH` alone moved `cmd.pp.pitchRatioH` and left `status.pp.pitchedWidth`
exactly where it was. The status only followed once `xUpdate` was written `true`. A script
that sets ratios and never commits looks like it worked and changes nothing.

### Out-of-range writes are DISCARDED, not clamped

With the field holding `1001`:

| written | field afterwards |
|---|---|
| `10001` | `1001` |
| `99` | `1001` |
| `100` | `100` |
| `10000` | `10000` |

No error, no clamp, no acknowledgement — the value simply does not change. This is why
`solveAxis` flags `outOfRange` and the UI refuses rather than clamping: a clamped 10.000 would
be a number this tool invented and the device never accepted, and the operator would be looking
at a field that still read whatever was there before.

### The footprint is floored

`pitchedWidth = floor(px * raw / 1000)`, established from fourteen pairs, four of which
distinguish floor from round:

| raw | px | device | round() |
|---|---|---|---|
| 1234 | 1080 | 1332 | 1333 |
| 1001 | 1920 | 1921 | 1922 |
| 333 | 1080 | 359 | 360 |
| 333 | 1920 | 639 | 639 |

All fourteen are `it.each` cases in `pitch.test.ts`. If someone "simplifies" `footprint()` to
round, four of them break by design.

### H and V are separate fields

Worth stating because it is easy to remember otherwise: the device holds `pitchRatioH` and
`pitchRatioV` as two independent integers, with two labelled inputs in the vendor UI. A group
whose pixels are genuinely non-square can be compensated correctly on both axes. The tool
supports it and drops an `anisotropic-ratio` note when the two differ, because far more often
that means a raster was typed wrong.

---

## What is NOT known

- **The real hardware.** Everything above is the simulator. It is the same `nlc-platform`
  application and the same object model, but no physical Aquilon has been touched. The
  parameter ranges are read out of the shipped client, so they are the vendor's own numbers
  rather than an inference — but firmware could differ from a simulator build.
- **Whether the reference group MUST be at 1.000.** The manual says it "should" be. Nothing
  observed suggests the device enforces it, and the field's range reaching down to 0.100
  implies it does not. The tool assumes the manual's convention because it is the only one
  that keeps ratios interpretable, not because the device was seen to require it.
- **Where the ceiling on a screen canvas actually is.** `SIZE_ATTRIBUTES.sizeH/sizeV` reads
  `min: 0, max: 1000000, readOnly: true`, which is not a real constraint. The meaningful cap
  found is `65535` on the pitched and AOI dimensions. What a given chassis will carry is a
  capacity question and belongs to
  [aquilon-vpu-map](https://github.com/stoatworks-labs/aquilon-vpu-map), not here.
- **Multi-output groups.** A group is one output logic key with one ratio pair. An output in
  a 4×1 DP box mode is one key; several *separate* outputs forming one wall are several keys,
  each needing the same ratio typed. The tool models one entry per key and does not know about
  box modes.

---

## Design decisions worth not undoing

**Millimetres everywhere.** Same choice as `aspect-calc` and `negative-space`, same reason:
pitch is quoted in mm on every spec sheet, and it is the hinge the whole app turns on. An SI
metre engine puts the most important number in the tool at `1e-3` and invites exponent slips.

**`resolvePitch` returns `null`, never `NaN`.** A half-typed form is the normal state of a
form. NaN propagates into every downstream number and turns the results column to `NaN` the
moment someone selects a raster to retype it; `null` means "not usable yet" and the rest of
the screen carries on.

**No socket, ever.** The AWJ frames are printed, not sent. A pitch change is a preconfig
change on a live show machine, and this staying a calculator is what makes it always safe to
open. If it ever needs to write, that belongs in `livepremier-plus`, which already has the
transport, the proxy and the safety story.

**Blocked groups do not get a footprint in the table.** An out-of-range ratio is never taken,
so its `pitchedWidth` never exists. Printing one is arithmetic about a state the device will
not enter. The canvas total still includes it — with the note "not achievable as specified"
under it, because the number is what the design *would* need and that is worth seeing.
