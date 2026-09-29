// Small shared UI pieces (server-safe: no hooks).

const PATHS = {
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  x: 'M18 6 6 18M6 6l12 12',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l5.64 5.36A9 9 0 0 0 20.49 15',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  sparkle: 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  swap: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  chevron: 'M9 18l6-6-6-6',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Score out of 100 with the pass line marked. Fill: accent when at/above the line, neutral below. */
export function ScoreBar({ value, line, label }: { value: number | null; line: number; label: string }) {
  if (value === null) return <span className="muted">–</span>
  const above = value >= line
  return (
    <div className="scorebar" title={`${label}: ${value.toFixed(1)} / 100 (line ${line})`}>
      <span className="scorebar-value">{value.toFixed(1)}</span>
      <span
        className="scorebar-track"
        role="meter"
        aria-label={`${label} score`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span className={`scorebar-fill ${above ? 'is-above' : ''}`} style={{ width: `${Math.max(2, value)}%` }} />
        <span className="scorebar-line" style={{ left: `${line}%` }} />
      </span>
    </div>
  )
}

/** 0-3 criterion score as three pips plus the number. */
export function ScoreDots({ score }: { score: number }) {
  return (
    <span className={`dots s${score}`} aria-label={`${score} out of 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= score ? 'on' : ''} />
      ))}
      <b>{score}</b>
    </span>
  )
}

type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'
export function Pill({ tone = 'neutral', icon, children, title }: { tone?: Tone; icon?: IconName; children: React.ReactNode; title?: string }) {
  return (
    <span className={`pill pill-${tone}`} title={title}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}

export function LinePill({ above, line }: { above: boolean; line?: number }) {
  return above ? (
    <Pill tone="good" icon="arrowUp">Above line{line !== undefined ? ` ${line}` : ''}</Pill>
  ) : (
    <Pill tone="neutral" icon="arrowDown">Below line{line !== undefined ? ` ${line}` : ''}</Pill>
  )
}

export function Avatar({ name, size = 32 }: { name: string | null; size?: number }) {
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
  // Stable hue per name, from a small fixed set.
  const hues = ['#4f6bed', '#0f8b8d', '#9b5de5', '#d9480f', '#2b8a3e', '#c2255c']
  const h = hues[[...(name ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length]
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: h }} aria-hidden="true">
      {initials || '?'}
    </span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Date parts in India time, with fixed month names (ICU prints "Sept" in some locales). */
function ist(iso: string) {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000)
  return { day: d.getUTCDate(), mon: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear(), h: d.getUTCHours(), m: d.getUTCMinutes() }
}
export const fmtShortDate = (iso: string) => {
  const d = ist(iso)
  return `${d.day} ${d.mon}`
}
export const fmtDate = (iso: string) => {
  const d = ist(iso)
  return `${d.day} ${d.mon} ${d.year}`
}
export const fmtDateTime = (iso: string) => {
  const d = ist(iso)
  return `${d.day} ${d.mon}, ${d.h % 12 || 12}:${String(d.m).padStart(2, '0')} ${d.h < 12 ? 'am' : 'pm'}`
}
