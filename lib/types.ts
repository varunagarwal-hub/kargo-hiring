export type Role = 'pm' | 'spm'
export const ROLES: Role[] = ['pm', 'spm']
export const ROLE_LABEL: Record<Role, string> = { pm: 'PM', spm: 'SPM' }
export const otherRole = (r: Role): Role => (r === 'pm' ? 'spm' : 'pm')

export type Criterion = {
  id: string
  rubric_id: string
  position: number
  name: string
  source_evidence: string
  strong_description: string
  weak_description: string
  spm_extra_bar: string | null
  weight: number
}

export type Rubric = {
  id: string
  role: Role
  version: number
  scoring_guide: string
  criteria: Criterion[] // sorted by position
}

export type Pii = {
  name: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  github_url: string | null
  other_urls: string[]
  address: string | null
}

export type CriterionScore = {
  criterion_id: string
  position: number
  score: number // after SPM gate
  model_score: number // as returned by the model
  gated: boolean
  reason: string
}

export type EmailType = 'invite' | 'rejection'

export type Settings = {
  pm_threshold: number
  spm_threshold: number
  top_n: number
  company_name: string
  sender_name: string
  reply_to: string
  signature: string
  invite_next_step: string
  jd_pm: string
  jd_spm: string
}
