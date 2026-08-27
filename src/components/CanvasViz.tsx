/**
 * The picture that makes pitch compensation obvious.
 *
 * Two rows, drawn to the SAME physical scale, because that is the claim being
 * made and a drawing is the fastest way to check it:
 *
 *   TOP     the walls as they stand in the room — width proportional to
 *           millimetres. This is what the audience sees.
 *   BOTTOM  the screen canvas — width proportional to canvas pixels. This is
 *           what you build content on.
 *
 * When compensation is right the two rows have the same proportions, and a
 * shape spanning a boundary crosses it at the same place in both. When it is
 * wrong they visibly disagree, which is the whole diagnostic.
 */

import type { Result } from '../lib/types.ts'

const W = 720
const ROW_H = 96
const GAP = 44
const PAD = 8

const COLOURS = ['#4cc9f0', '#f2b134', '#5ec98a', '#c77dff', '#ef5d5d', '#7bdff2']

export function CanvasViz({ result }: { result: Result }) {
  if (result.groups.length === 0 || result.canvas.width === 0) {
    return <p className="empty">Give a group a raster and a pitch and the canvas appears here.</p>
  }

  const vertical = result.groups.length > 1
    && result.groups[1].canvasY > 0

  // Physical extent, laid out in the same order and direction as the canvas.
  const physical = result.groups.map((g) => (vertical ? g.physicalHeightMm : g.physicalWidthMm))
  const physicalTotal = physical.reduce((a, b) => a + b, 0)
  const canvasTotal = vertical ? result.canvas.height : result.canvas.width

  const scalePhys = (W - PAD * 2) / (physicalTotal || 1)
  const scaleCanvas = (W - PAD * 2) / (canvasTotal || 1)

  let physCursor = PAD
  let canvasCursor = PAD

  const bars = result.groups.map((g, i) => {
    const colour = COLOURS[i % COLOURS.length]
    const pw = physical[i] * scalePhys
    const cw = (vertical ? g.v.footprint : g.h.footprint) * scaleCanvas
    const bar = {
      key: g.group.id,
      colour,
      name: g.group.name || g.group.id,
      isReference: g.isReference,
      physX: physCursor,
      physW: pw,
      canvasX: canvasCursor,
      canvasW: cw,
      ratio: vertical ? g.v.ratio : g.h.ratio,
      raster: vertical ? g.group.pxHeight : g.group.pxWidth,
      canvasPx: vertical ? g.v.footprint : g.h.footprint,
      mm: physical[i],
    }
    physCursor += pw
    canvasCursor += cw
    return bar
  })

  const total = ROW_H * 2 + GAP + 46

  return (
    <div className="viz-wrap">
      <svg viewBox={`0 0 ${W} ${total}`} className="viz" role="img"
        aria-label="The walls in the room above, the screen canvas below, drawn to the same scale">
        <text x={PAD} y={12} className="viz-cap">
          On the wall — {fmtM(physicalTotal)} of {vertical ? 'height' : 'width'}
        </text>

        {bars.map((b) => (
          <g key={`p-${b.key}`}>
            <rect
              x={b.physX} y={18} width={Math.max(1, b.physW - 2)} height={ROW_H}
              fill={b.colour} fillOpacity={0.18} stroke={b.colour} strokeWidth={1.5} rx={3}
            />
            <text x={b.physX + b.physW / 2} y={18 + ROW_H / 2 - 4} className="viz-name">
              {b.name}
            </text>
            <text x={b.physX + b.physW / 2} y={18 + ROW_H / 2 + 13} className="viz-detail">
              {b.raster} px · {fmtM(b.mm)}
            </text>
          </g>
        ))}

        {/* The tie-lines. Each wall's boundary in the room maps to a boundary on
            the canvas; drawing the join is what shows the mapping is uniform. */}
        {bars.map((b) => (
          <line
            key={`t-${b.key}`}
            x1={b.physX} y1={18 + ROW_H}
            x2={b.canvasX} y2={18 + ROW_H + GAP}
            stroke={b.colour} strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
          />
        ))}
        <line
          x1={W - PAD} y1={18 + ROW_H} x2={W - PAD} y2={18 + ROW_H + GAP}
          stroke="#64798f" strokeWidth={1} strokeDasharray="3 3" opacity={0.5}
        />

        <text x={PAD} y={18 + ROW_H + GAP - 8} className="viz-cap">
          Screen canvas — {result.canvas.width} × {result.canvas.height} px
        </text>

        {bars.map((b) => (
          <g key={`c-${b.key}`}>
            <rect
              x={b.canvasX} y={18 + ROW_H + GAP} width={Math.max(1, b.canvasW - 2)} height={ROW_H}
              fill={b.colour} fillOpacity={b.isReference ? 0.3 : 0.18}
              stroke={b.colour} strokeWidth={b.isReference ? 2.5 : 1.5} rx={3}
            />
            <text
              x={b.canvasX + b.canvasW / 2} y={18 + ROW_H + GAP + ROW_H / 2 - 4}
              className="viz-ratio"
            >
              {b.ratio.toFixed(3)}
            </text>
            <text
              x={b.canvasX + b.canvasW / 2} y={18 + ROW_H + GAP + ROW_H / 2 + 13}
              className="viz-detail"
            >
              {b.canvasPx} canvas px
            </text>
            {b.isReference ? (
              <text
                x={b.canvasX + b.canvasW / 2} y={18 + ROW_H + GAP + ROW_H - 8}
                className="viz-tag"
              >
                reference
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  )
}

function fmtM(mm: number): string {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`
}
