/**
 * `dist-lib/` is generated but COMMITTED, because other repos vendor it and a
 * fresh clone must be able to hand them a file without a build step first.
 *
 * Committed build output goes stale silently — someone edits `pitch.ts`, the
 * app is right, and every tool that borrowed the engine quietly disagrees with
 * it. These tests are the tripwire: they load the built bundle and the source
 * side by side and demand the same answers.
 *
 * If one fails, the fix is `npm run build:lib` and commit the result. It is not
 * to relax the test.
 *
 * What this does NOT catch: a source edit that changes nothing for these
 * particular inputs. Changing `DRIFT_WARN_PX` from 0.5 to 0.25 passes here,
 * because no case below drifts into the gap. Changing `footprint()` to round
 * fails three of them, which is the class of divergence that matters. Widen
 * `CASES` when a change slips through rather than trusting the sweep is total.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import * as source from '../index.ts'
import type { Project } from '../types.ts'

const BUILT = fileURLToPath(new URL('../../../dist-lib/aquilon-pitch-engine.js', import.meta.url))

const CASES: Project[] = [
  {
    name: 'equal physical size, half the resolution',
    arrangement: 'row',
    referenceId: '',
    groups: [
      { id: 'a', name: 'Main', outputKey: '1', pxWidth: 3840, pxHeight: 2160, entry: { mode: 'pitch', hMm: 2.6, vMm: 2.6 } },
      { id: 'b', name: 'Side', outputKey: '2', pxWidth: 1920, pxHeight: 1080, entry: { mode: 'pitch', hMm: 5.2, vMm: 5.2 } },
    ],
  },
  {
    name: 'a ratio that does not land clean',
    arrangement: 'row',
    referenceId: '',
    groups: [
      { id: 'a', name: 'Main', outputKey: '1', pxWidth: 1920, pxHeight: 1080, entry: { mode: 'pitch', hMm: 2.6, vMm: 2.6 } },
      { id: 'b', name: 'Odd', outputKey: '2', pxWidth: 1920, pxHeight: 1080, entry: { mode: 'pitch', hMm: 4.0, vMm: 4.0 } },
    ],
  },
  {
    name: 'out of range, non-square, and measured-size entry',
    arrangement: 'column',
    referenceId: '',
    groups: [
      { id: 'a', name: 'Fine', outputKey: '1', pxWidth: 2048, pxHeight: 1152, entry: { mode: 'size', widthMm: 5324.8, heightMm: 2995.2 } },
      { id: 'b', name: 'Odd', outputKey: '2', pxWidth: 1024, pxHeight: 512, entry: { mode: 'pitch', hMm: 6.0, vMm: 4.0 } },
      { id: 'c', name: 'Silly', outputKey: '9', pxWidth: 512, pxHeight: 256, entry: { mode: 'pitch', hMm: 40, vMm: 40 } },
    ],
  },
]

describe('the committed dist-lib bundle', () => {
  it('exists — other repos vendor this file', () => {
    expect(existsSync(BUILT), `${BUILT} is missing — run: npm run build:lib`).toBe(true)
  })

  it('exports the same public API as the barrel', async () => {
    const built = await import(BUILT)
    // Type-only exports vanish at runtime, so this compares the value surface.
    expect(Object.keys(built).sort()).toEqual(Object.keys(source).sort())
  })

  it.each(CASES)('agrees with the source engine on: $name', async (project) => {
    const built = await import(BUILT)
    expect(JSON.stringify(built.compensate(project)))
      .toBe(JSON.stringify(source.compensate(project)))
  })

  it('agrees on the device arithmetic itself', async () => {
    const built = await import(BUILT)
    for (const raw of [100, 333, 1000, 1001, 1234, 1500, 2000, 10000]) {
      for (const px of [1080, 1920, 3840]) {
        expect(built.footprint(px, raw)).toBe(source.footprint(px, raw))
      }
    }
    expect(built.PITCH_MIN).toBe(source.PITCH_MIN)
    expect(built.PITCH_MAX).toBe(source.PITCH_MAX)
    expect(built.PITCH_SCALE).toBe(source.PITCH_SCALE)
  })

  it('agrees on the AWJ frames, which is what a host actually sends', async () => {
    const built = await import(BUILT)
    for (const project of CASES) {
      expect(JSON.stringify(built.awjFrames(built.compensate(project))))
        .toBe(JSON.stringify(source.awjFrames(source.compensate(project))))
    }
  })
})
