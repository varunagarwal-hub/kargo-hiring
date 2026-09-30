// Small shared UI pieces (server-safe: no hooks).

const PATHS = {
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  plus: 'M12 5v14M5 12h14',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 15, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="square" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Score out of 100 on a hairline rule, with the pass line marked. */
export function ScoreBar({ value, line, label, showValue = true }: { value: number | null; line: number; label: string; showValue?: boolean }) {
  if (value === null) return <span className="faint">—</span>
  const above = value >= line
  return (
    <span className="score" title={`${label}: ${value.toFixed(1)} of 100 · line ${line}`}>
      {showValue && <span className={`score-n ${above ? 'is-above' : ''}`}>{value.toFixed(1)}</span>}
      <span className="score-rule" role="meter" aria-label={`${label} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <span className={`score-fill ${above ? 'is-above' : ''}`} style={{ width: `${Math.max(1.5, value)}%` }} />
        <span className="score-line" style={{ left: `${line}%` }} />
      </span>
    </span>
  )
}

/** A 0–3 criterion score as three square marks and the fraction. */
export function ScoreMarks({ score }: { score: number }) {
  return (
    <span className="marks" aria-label={`${score} of 3`}>
      <span className="marks-sq" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= score ? 'on' : ''} />
        ))}
      </span>
      <span className="marks-n">{score}/3</span>
    </span>
  )
}

type Tone = 'good' | 'accent' | 'bad' | 'quiet'
/** Status as a word with a small marker, never colour alone. */
export function Mark({ tone = 'quiet', children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`mark mark-${tone}`} title={title}>
      {children}
    </span>
  )
}

export function LineMark({ above }: { above: boolean }) {
  return above ? <Mark tone="good">Above the line</Mark> : <Mark tone="quiet">Below the line</Mark>
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Date parts in India time, with fixed month names. */
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
