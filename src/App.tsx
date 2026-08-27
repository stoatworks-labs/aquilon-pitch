import { useEffect, useMemo, useState } from 'react'

import { compensate } from './lib/pitch.ts'
import { csv, walkthrough, awjFrames } from './lib/awj.ts'
import { UI_LOCATION } from './lib/device.ts'
import { load, save, shareLink } from './lib/urlstate.ts'
import { CanvasViz } from './components/CanvasViz.tsx'
import { CopyButton, Field, Panel, Segmented, Stat } from './components/ui.tsx'
import type { OutputGroup, Project, Warning } from './types.ts'

export default function App() {
  const [project, setProject] = useState<Project>(load)

  useEffect(() => { save(project) }, [project])

  // A shared link pasted into a tab that already has the app open changes the
  // hash without reloading, so without this the link silently does nothing and
  // the recipient reads someone else's numbers as their own.
  useEffect(() => {
    const onHash = () => setProject(load())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const result = useMemo(() => compensate(project), [project])

  const patch = (id: string, over: Partial<OutputGroup>) =>
    setProject((p) => ({ ...p, groups: p.groups.map((g) => (g.id === id ? { ...g, ...over } : g)) }))

  const addGroup = () => setProject((p) => ({
    ...p,
    groups: [...p.groups, {
      id: Math.random().toString(36).slice(2, 8),
      name: `Group ${p.groups.length + 1}`,
      outputKey: '',
      pxWidth: 1920,
      pxHeight: 1080,
      entry: { mode: 'pitch', hMm: 2.6, vMm: 2.6 },
    }],
  }))

  const removeGroup = (id: string) => setProject((p) => ({
    ...p,
    groups: p.groups.filter((g) => g.id !== id),
    referenceId: p.referenceId === id ? '' : p.referenceId,
  }))

  const errors = result.warnings.filter((w) => w.level === 'error')

  return (
    <div className="app">
      <header className="topbar">
        <strong>Aquilon Pitch</strong>
        <span className="tag">LivePremier pitch compensation</span>
        <span className="grow" />
        <CopyButton text={shareLink(project)} label="Copy link" />
      </header>

      <main className="cols">
        <div className="col">
          <Panel
            title="Screen"
            sub="One LivePremier screen, and the output groups that light it."
            right={<button type="button" className="btn" onClick={addGroup}>Add group</button>}
          >
            <div className="row">
              <Field
                label="Name" type="text" value={project.name}
                onChange={(v) => setProject((p) => ({ ...p, name: v }))}
              />
              <label className="field">
                <span className="field-label">Groups run</span>
                <Segmented
                  value={project.arrangement}
                  onChange={(v) => setProject((p) => ({ ...p, arrangement: v }))}
                  options={[
                    { value: 'row', label: 'Left to right' },
                    { value: 'column', label: 'Top to bottom' },
                  ]}
                />
              </label>
            </div>

            <label className="field wide">
              <span className="field-label">Reference group — held at 1.000</span>
              <select
                value={project.referenceId}
                onChange={(e) => setProject((p) => ({ ...p, referenceId: e.target.value }))}
              >
                <option value="">Finest pitch (recommended)</option>
                {project.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name || g.id}</option>
                ))}
              </select>
            </label>
            <p className="hint">
              The finest pitch is the right reference nearly always: every other group then sits
              above 1.000 and scales <em>down</em> into its raster. Choose a coarse group and the
              finest wall in the room spends the show upscaling.
            </p>
          </Panel>

          {project.groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              isReference={result.groups.find((r) => r.group.id === g.id)?.isReference ?? false}
              onChange={(over) => patch(g.id, over)}
              onRemove={() => removeGroup(g.id)}
              canRemove={project.groups.length > 1}
            />
          ))}
        </div>

        <div className="col">
          <Panel
            title="What to type"
            sub={UI_LOCATION}
            right={<CopyButton text={walkthrough(result)} label="Copy steps" />}
          >
            {result.reference ? (
              <>
                <div className="stats">
                  <Stat
                    label="Screen canvas"
                    value={`${result.canvas.width} × ${result.canvas.height}`}
                    tone={errors.length ? 'danger' : undefined}
                    // With a blocked group in the design this number is what the
                    // screen WOULD need, not what it will get — the device never
                    // takes that group's ratio, so its footprint never exists.
                    // Saying "pixels" under it would be a straight lie.
                    note={errors.length ? 'not achievable as specified' : 'pixels'}
                  />
                  <Stat
                    label="Canvas pixel"
                    value={`${result.canvasPitch!.meanMm.toFixed(3)} mm`}
                    note={`the ${result.reference.group.name || 'reference'} pitch`}
                  />
                  <Stat
                    label="Status"
                    value={errors.length ? `${errors.length} blocked` : 'Settable'}
                    tone={errors.length ? 'danger' : 'ok'}
                    note={errors.length ? 'the device will refuse these' : 'every ratio is in range'}
                  />
                </div>

                <table className="grid">
                  <thead>
                    <tr>
                      <th>Group</th><th>Output</th><th>H Ratio</th><th>V Ratio</th>
                      <th>Canvas footprint</th><th>Drift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.groups.map((g) => (
                      <tr key={g.group.id} className={g.isReference ? 'is-ref' : ''}>
                        <td>
                          {g.group.name || g.group.id}
                          {g.isReference ? <span className="pill">ref</span> : null}
                        </td>
                        <td className="mono dim">{g.group.outputKey || '—'}</td>
                        <td className={`mono${g.h.outOfRange ? ' bad' : ''}`}>
                          {g.h.outOfRange ? `${g.h.exact.toFixed(3)} ✕` : g.h.ratio.toFixed(3)}
                        </td>
                        <td className={`mono${g.v.outOfRange ? ' bad' : ''}`}>
                          {g.v.outOfRange ? `${g.v.exact.toFixed(3)} ✕` : g.v.ratio.toFixed(3)}
                        </td>
                        <td className="mono dim">
                          {g.h.outOfRange || g.v.outOfRange
                            ? '—'
                            : `${g.h.footprint} × ${g.v.footprint}`}
                        </td>
                        <td className="mono dim">
                          {/* Drift on a ratio the device refuses is arithmetic
                              about a state that never happens. */}
                          {g.h.outOfRange || g.v.outOfRange
                            ? '—'
                            : drift(g.h.errorMm, g.v.errorMm)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="hint">
                  Both fields sit under <strong>Pitch</strong> on the selected output group, labelled
                  {' '}<strong>H Ratio</strong> and <strong>V Ratio</strong>. The field holds three
                  decimals and takes 0.100 to 10.000; anything outside that is discarded without a
                  message.
                </p>
              </>
            ) : (
              <p className="empty">Give at least one group a raster and a pitch.</p>
            )}
          </Panel>

          <Panel title="The screen, drawn twice" sub="The room above, the canvas below, same scale.">
            <CanvasViz result={result} />
          </Panel>

          {result.warnings.length > 0 ? (
            <Panel title="Worth knowing" sub={`${result.warnings.length} note${result.warnings.length === 1 ? '' : 's'}`}>
              <ul className="warnings">
                {result.warnings.map((w, i) => <WarnRow key={i} w={w} />)}
              </ul>
            </Panel>
          ) : null}

          <Panel
            title="Take it away"
            sub="Nothing is sent anywhere — this tool has no socket and will not grow one."
            right={<CopyButton text={csv(result)} label="Copy CSV" />}
          >
            <details>
              <summary>AWJ frames, if you are scripting it</summary>
              <p className="hint">
                What a Web RCS socket would carry for this design. <strong>xUpdate</strong> is not
                optional: writing a ratio alone moves the command value and leaves the canvas where
                it was.
              </p>
              <pre className="code">{JSON.stringify(awjFrames(result), null, 1)}</pre>
            </details>
          </Panel>
        </div>
      </main>

      <footer className="foot">
        <span>{__APP_VERSION__}</span>
        <span>
          Ratios verified against AW LivePremier Simulator 6.2.73. Never checked on real hardware.
        </span>
      </footer>
    </div>
  )
}

function WarnRow({ w }: { w: Warning }) {
  return <li className={`w-${w.level}`}><span className="w-code">{w.code}</span>{w.message}</li>
}

function drift(h: number, v: number): string {
  const worst = Math.abs(h) >= Math.abs(v) ? h : v
  if (Math.abs(worst) < 0.05) return '—'
  return `${worst > 0 ? '+' : ''}${worst.toFixed(1)} mm`
}

function GroupCard({ group, isReference, onChange, onRemove, canRemove }: {
  group: OutputGroup
  isReference: boolean
  onChange: (over: Partial<OutputGroup>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const e = group.entry

  return (
    <Panel
      title={group.name || 'Untitled group'}
      sub={isReference ? 'Reference — both ratios stay at 1.000' : undefined}
      right={canRemove
        ? <button type="button" className="btn ghost" onClick={onRemove}>Remove</button>
        : null}
    >
      <div className="row">
        <Field label="Name" type="text" value={group.name} onChange={(v) => onChange({ name: v })} />
        <Field
          label="Output key" type="text" value={group.outputKey} width={110}
          onChange={(v) => onChange({ outputKey: v.trim() })}
        />
      </div>

      <div className="row">
        <Field
          label="Raster width" value={group.pxWidth} suffix="px" width={150}
          onChange={(v) => onChange({ pxWidth: num(v) })}
        />
        <Field
          label="Raster height" value={group.pxHeight} suffix="px" width={150}
          onChange={(v) => onChange({ pxHeight: num(v) })}
        />
      </div>

      <label className="field wide">
        <span className="field-label">Known from</span>
        <Segmented
          value={e.mode}
          onChange={(mode) => onChange({
            entry: mode === 'pitch'
              ? { mode: 'pitch', hMm: 2.6, vMm: 2.6 }
              : { mode: 'size', widthMm: 4992, heightMm: 2808 },
          })}
          options={[
            { value: 'pitch', label: 'Pitch' },
            { value: 'size', label: 'Measured size' },
          ]}
        />
      </label>

      {e.mode === 'pitch' ? (
        <div className="row">
          <Field
            label="H pitch" value={e.hMm} suffix="mm" step="0.001" width={150}
            onChange={(v) => onChange({ entry: { ...e, hMm: num(v) } })}
          />
          <Field
            label="V pitch" value={e.vMm} suffix="mm" step="0.001" width={150}
            onChange={(v) => onChange({ entry: { ...e, vMm: num(v) } })}
          />
          <button
            type="button" className="btn ghost"
            onClick={() => onChange({ entry: { ...e, vMm: e.hMm } })}
          >
            V = H
          </button>
        </div>
      ) : (
        <div className="row">
          <Field
            label="Active width" value={e.widthMm} suffix="mm" width={150}
            onChange={(v) => onChange({ entry: { ...e, widthMm: num(v) } })}
          />
          <Field
            label="Active height" value={e.heightMm} suffix="mm" width={150}
            onChange={(v) => onChange({ entry: { ...e, heightMm: num(v) } })}
          />
          <span className="derived">
            = {(e.widthMm / (group.pxWidth || 1)).toFixed(3)} ×
            {' '}{(e.heightMm / (group.pxHeight || 1)).toFixed(3)} mm
          </span>
        </div>
      )}
    </Panel>
  )
}

/**
 * An empty field is 0, not NaN.
 *
 * NaN propagates through every downstream number and turns the whole results
 * column into "NaN" the moment someone selects a raster to retype it. Zero is
 * caught by `resolvePitch`, which treats the group as not yet usable and leaves
 * the rest of the screen alone.
 */
function num(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
