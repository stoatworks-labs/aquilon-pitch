/** Small shared controls. Nothing here knows about pitch. */

import type { ReactNode } from 'react'

export function Panel({ title, sub, right, children }: {
  title: string
  sub?: ReactNode
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {sub ? <p className="sub">{sub}</p> : null}
        </div>
        {right}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}

export function Field({ label, value, onChange, suffix, width, step, type = 'number' }: {
  label: string
  value: string | number
  onChange: (v: string) => void
  suffix?: string
  width?: number
  step?: string
  type?: 'number' | 'text'
}) {
  return (
    <label className="field" style={width ? { width } : undefined}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type={type}
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          // A number input that selects on focus is the difference between
          // retyping a raster and fighting a cursor.
          onFocus={(e) => e.target.select()}
        />
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, note, tone }: {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: 'ok' | 'warn' | 'danger'
}) {
  return (
    <div className={`stat${tone ? ` t-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="btn"
      onClick={() => { void navigator.clipboard?.writeText(text) }}
    >
      {label}
    </button>
  )
}
