import { describe, it, expect } from 'vitest'

import { compensate, pickReference, resolvePitch, SQUARE_PIXEL_TOLERANCE } from '../pitch.ts'
import { footprint, PITCH_MIN, PITCH_MAX, PITCH_SCALE } from '../device.ts'
import { awjFrames, csv, instructions, walkthrough } from '../awj.ts'
import type { OutputGroup, Project } from '../../types.ts'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

let seq = 0
function byPitch(name: string, px: [number, number], pitchMm: number | [number, number]): OutputGroup {
  const [h, v] = Array.isArray(pitchMm) ? pitchMm : [pitchMm, pitchMm]
  return {
    id: `g${++seq}`, name, outputKey: String(seq),
    pxWidth: px[0], pxHeight: px[1],
    entry: { mode: 'pitch', hMm: h, vMm: v },
  }
}

function bySize(name: string, px: [number, number], mm: [number, number]): OutputGroup {
  return {
    id: `g${++seq}`, name, outputKey: String(seq),
    pxWidth: px[0], pxHeight: px[1],
    entry: { mode: 'size', widthMm: mm[0], heightMm: mm[1] },
  }
}

function project(groups: OutputGroup[], over: Partial<Project> = {}): Project {
  return { name: 'test', groups, referenceId: '', arrangement: 'row', ...over }
}

// ---------------------------------------------------------------------------
// The device's own arithmetic, as measured
// ---------------------------------------------------------------------------

describe('device footprint — measured on LivePremier simulator 6.2.73', () => {
  // Every one of these pairs was driven into output 1 of a running simulator
  // (1920x1080 raster) and the resulting status.pitchedWidth/Height read back.
  // If a refactor changes floor() to round(), four of these six break.
  it.each([
    // raw,   px,   observed pitched dimension
    [2000, 1920, 3840],
    [2000, 1080, 2160],
    [1234, 1920, 2369], // 2369.28 floored
    [1234, 1080, 1332], // 1332.72 floored — ROUNDING would give 1333
    [1500, 1920, 2880],
    [1500, 1080, 1620],
    [1001, 1920, 1921], // 1921.92 floored — ROUNDING would give 1922
    [1001, 1080, 1081],
    [100, 1920, 192],
    [100, 1080, 108],
    [10000, 1920, 19200],
    [10000, 1080, 10800],
    [333, 1920, 639],
    [333, 1080, 359],   // 359.64 floored — ROUNDING would give 360
  ])('raw %i on %i px -> %i canvas px', (raw, px, expected) => {
    expect(footprint(px, raw)).toBe(expected)
  })

  it('floors rather than rounds, and the difference is a whole pixel', () => {
    // 1080 * 1.234 = 1332.72. The simulator produced 1332.
    expect(footprint(1080, 1234)).toBe(1332)
    expect(Math.round((1080 * 1234) / PITCH_SCALE)).toBe(1333)
  })
})

// ---------------------------------------------------------------------------
// resolvePitch
// ---------------------------------------------------------------------------

describe('resolvePitch', () => {
  it('takes a stated pitch as given', () => {
    const p = resolvePitch(byPitch('a', [1920, 1080], 2.6))!
    expect(p.hMm).toBe(2.6)
    expect(p.vMm).toBe(2.6)
    expect(p.square).toBe(true)
  })

  it('derives pitch from measured size and raster', () => {
    // 4992 mm across 1920 px is 2.6 mm.
    const p = resolvePitch(bySize('a', [1920, 1080], [4992, 2808]))!
    expect(p.hMm).toBeCloseTo(2.6, 10)
    expect(p.vMm).toBeCloseTo(2.6, 10)
  })

  it('reports anisotropy rather than averaging it away', () => {
    const p = resolvePitch(byPitch('a', [1920, 1080], [2.5, 3.0]))!
    expect(p.square).toBe(false)
    expect(p.anisotropy).toBeGreaterThan(SQUARE_PIXEL_TOLERANCE)
    expect(p.meanMm).toBeCloseTo(Math.sqrt(7.5), 10)
  })

  it('tolerates a spec sheet that rounds 2.604 to 2.6', () => {
    const p = resolvePitch(byPitch('a', [1920, 1080], [2.604, 2.6]))!
    expect(p.square).toBe(true)
  })

  it('returns null for input that cannot make a pitch, rather than NaN', () => {
    expect(resolvePitch(byPitch('a', [1920, 1080], 0))).toBeNull()
    expect(resolvePitch(bySize('a', [0, 0], [4992, 2808]))).toBeNull()
    expect(resolvePitch(bySize('a', [1920, 1080], [0, 0]))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Reference selection
// ---------------------------------------------------------------------------

describe('pickReference', () => {
  it('defaults to the finest pitch, so nothing is ever upscaled', () => {
    const fine = byPitch('fine', [1920, 1080], 2.6)
    const coarse = byPitch('coarse', [1920, 1080], 5.2)
    expect(pickReference(project([coarse, fine]))!.id).toBe(fine.id)
  })

  it('honours an explicit override', () => {
    const fine = byPitch('fine', [1920, 1080], 2.6)
    const coarse = byPitch('coarse', [1920, 1080], 5.2)
    const p = project([fine, coarse], { referenceId: coarse.id })
    expect(pickReference(p)!.id).toBe(coarse.id)
  })

  it('ignores an override naming a group that cannot produce a pitch', () => {
    const fine = byPitch('fine', [1920, 1080], 2.6)
    const broken = byPitch('broken', [1920, 1080], 0)
    const p = project([fine, broken], { referenceId: broken.id })
    expect(pickReference(p)!.id).toBe(fine.id)
  })

  it('is null when nothing is usable', () => {
    expect(pickReference(project([byPitch('a', [1920, 1080], 0)]))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The headline case
// ---------------------------------------------------------------------------

describe('compensate', () => {
  it('gives the reference 1.000 and a double-pitch wall 2.000', () => {
    // The case from the manual's own description: two walls, same physical
    // size, one at half the resolution of the other.
    const main = bySize('main', [3840, 2160], [10000, 5625])
    const second = bySize('second', [1920, 1080], [10000, 5625])
    const r = compensate(project([main, second]))

    expect(r.reference!.group.id).toBe(main.id)
    expect(r.groups[0].h.ratio).toBe(1)
    expect(r.groups[0].v.ratio).toBe(1)
    expect(r.groups[1].h.ratio).toBe(2)
    expect(r.groups[1].v.ratio).toBe(2)

    // The half-resolution wall covers the same canvas area as the full one,
    // which is the entire point: a layer spanning both is the same size on
    // both walls.
    expect(r.groups[1].h.footprint).toBe(3840)
    expect(r.groups[1].v.footprint).toBe(2160)
  })

  it('lays the groups out along the canvas and sizes it to the bounding box', () => {
    const a = byPitch('a', [1920, 1080], 2.6)
    const b = byPitch('b', [1920, 1080], 5.2)
    const r = compensate(project([a, b]))

    expect(r.groups[0].canvasX).toBe(0)
    expect(r.groups[1].canvasX).toBe(1920)
    expect(r.canvas).toEqual({ width: 1920 + 3840, height: 2160 })
  })

  it('stacks down the canvas when arranged as a column', () => {
    const a = byPitch('a', [1920, 1080], 2.6)
    const b = byPitch('b', [1920, 1080], 5.2)
    const r = compensate(project([a, b], { arrangement: 'column' }))

    expect(r.groups[1].canvasY).toBe(1080)
    expect(r.canvas).toEqual({ width: 3840, height: 1080 + 2160 })
  })

  it('holds the two axes separately for a non-square-pixel group', () => {
    const ref = byPitch('ref', [1920, 1080], 2.0)
    const odd = byPitch('odd', [1920, 1080], [4.0, 3.0])
    const r = compensate(project([ref, odd]))

    expect(r.groups[1].h.ratio).toBe(2)
    expect(r.groups[1].v.ratio).toBe(1.5)
    expect(r.warnings.some((w) => w.code === 'anisotropic-ratio')).toBe(true)
  })

  it('quantises to three decimals and reports what that costs', () => {
    // 4.0 / 2.6 = 1.5384615..., which the field holds as 1.538.
    const ref = byPitch('ref', [1920, 1080], 2.6)
    const other = byPitch('other', [1920, 1080], 4.0)
    const r = compensate(project([ref, other]))
    const g = r.groups[1]

    expect(g.h.exact).toBeCloseTo(1.5384615, 6)
    expect(g.h.ratio).toBe(1.538)
    expect(g.h.raw).toBe(1538)

    // 1920 * 1.5384615 = 2953.846 ideal; the device gives floor(1920*1538/1000)
    // = 2952. That is 1.85 canvas px short.
    expect(g.h.footprint).toBe(2952)
    expect(g.h.errorPx).toBeCloseTo(-1.846, 3)
    // A canvas pixel here is the reference pitch, 2.6 mm.
    expect(g.h.errorMm).toBeCloseTo(-4.8, 1)
    expect(r.warnings.some((w) => w.code === 'quantised' && w.groupId === other.id)).toBe(true)
  })

  it('refuses a ratio the device would reject, and does not clamp it', () => {
    // 30 mm against 2.6 mm is 11.54 — past the 10.000 ceiling.
    const ref = byPitch('ref', [1920, 1080], 2.6)
    const silly = byPitch('silly', [512, 256], 30)
    const r = compensate(project([ref, silly]))

    expect(r.groups[1].h.outOfRange).toBe(true)
    expect(r.groups[1].h.raw).toBeGreaterThan(PITCH_MAX)
    const w = r.warnings.find((x) => x.code === 'out-of-range')
    expect(w?.level).toBe('error')
    expect(w?.message).toMatch(/discards an out-of-range write/)
  })

  it('warns when the chosen reference forces another group to upscale', () => {
    const fine = byPitch('fine', [1920, 1080], 2.6)
    const coarse = byPitch('coarse', [1920, 1080], 5.2)
    const r = compensate(project([fine, coarse], { referenceId: coarse.id }))

    expect(r.groups[0].h.ratio).toBe(0.5)
    const w = r.warnings.find((x) => x.code === 'upsampled')
    expect(w?.level).toBe('warn')
    expect(w?.message).toMatch(/make it the reference instead/)
  })

  it('says plainly when no compensation is needed at all', () => {
    const a = byPitch('a', [1920, 1080], 2.6)
    const b = byPitch('b', [1920, 1080], 2.6)
    const r = compensate(project([a, b]))
    expect(r.warnings.some((w) => w.code === 'no-compensation-needed')).toBe(true)
  })

  it('does not warn about compensation when there is only one group', () => {
    const r = compensate(project([byPitch('a', [1920, 1080], 2.6)]))
    expect(r.warnings.some((w) => w.code === 'no-compensation-needed')).toBe(false)
  })

  it('skips groups that cannot produce a pitch instead of poisoning the canvas', () => {
    const good = byPitch('good', [1920, 1080], 2.6)
    const bad = byPitch('bad', [1920, 1080], 0)
    const r = compensate(project([good, bad]))

    expect(r.groups).toHaveLength(1)
    expect(Number.isFinite(r.canvas.width)).toBe(true)
    expect(r.canvas.width).toBe(1920)
  })

  it('is empty, not broken, with no usable groups at all', () => {
    const r = compensate(project([]))
    expect(r.reference).toBeNull()
    expect(r.canvas).toEqual({ width: 0, height: 0 })
  })

  it('accepts the extremes of the field without flagging them', () => {
    const ref = byPitch('ref', [1920, 1080], 1.0)
    const max = byPitch('max', [1920, 1080], 10.0)
    const r = compensate(project([ref, max]))
    expect(r.groups[1].h.raw).toBe(PITCH_MAX)
    expect(r.groups[1].h.outOfRange).toBe(false)

    const r2 = compensate(project([ref, max], { referenceId: max.id }))
    expect(r2.groups[0].h.raw).toBe(PITCH_MIN)
    expect(r2.groups[0].h.outOfRange).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

describe('instructions and export', () => {
  const ref = byPitch('Main', [3840, 2160], 2.6)
  const half = byPitch('Side', [1920, 1080], 5.2)
  const r = compensate(project([ref, half]))

  it('marks the reference as a no-op', () => {
    const [a, b] = instructions(r)
    expect(a.isReference).toBe(true)
    expect(a.noop).toBe(true)
    expect(b.noop).toBe(false)
    expect(b.hRatio).toBe(2)
  })

  it('writes both axes and the commit, in that order', () => {
    const frames = awjFrames(r)
    // Reference is a no-op in the UI but still gets written: an operator may be
    // undoing someone else's compensation, and 1.000 is a real value.
    expect(frames).toHaveLength(6)
    expect(frames[3].data.path.at(-1)).toBe('pitchRatioH')
    expect(frames[3].data.value).toBe(2000)
    expect(frames[4].data.path.at(-1)).toBe('pitchRatioV')
    expect(frames[5].data.path.at(-1)).toBe('xUpdate')
    expect(frames[5].data.value).toBe(true)
  })

  it('addresses the output logic key the group names', () => {
    const frames = awjFrames(r)
    expect(frames[0].data.path).toEqual([
      'device', 'outputList', 'items', ref.outputKey, 'canvas', 'cmd', 'pp', 'pitchRatioH',
    ])
  })

  it('skips a group with no output key rather than writing to output ""', () => {
    const anon = { ...byPitch('anon', [1920, 1080], 5.2), outputKey: '' }
    const frames = awjFrames(compensate(project([ref, anon])))
    expect(frames.every((f) => f.data.path[3] !== '')).toBe(true)
    expect(frames).toHaveLength(3)
  })

  it('emits no frames for a ratio the device would reject', () => {
    const silly = byPitch('silly', [512, 256], 40)
    const frames = awjFrames(compensate(project([ref, silly])))
    expect(frames.every((f) => f.data.path[3] === ref.outputKey)).toBe(true)
  })

  it('names the field labels the operator will actually see', () => {
    expect(walkthrough(r)).toMatch(/H Ratio 2\.000, V Ratio 2\.000/)
    expect(walkthrough(r)).toMatch(/Preconfig > Canvas/)
  })

  it('rounds a CSV that opens in a spreadsheet without exponent notation', () => {
    const text = csv(r)
    expect(text.split('\n')).toHaveLength(3)
    expect(text).not.toMatch(/e[+-]\d/i)
    expect(text.split('\n')[2]).toMatch(/^Side,/)
  })

  it('quotes a group name containing a comma', () => {
    const odd = { ...byPitch('Upstage, house left', [1920, 1080], 5.2), outputKey: '9' }
    expect(csv(compensate(project([ref, odd])))).toMatch(/"Upstage, house left"/)
  })
})
