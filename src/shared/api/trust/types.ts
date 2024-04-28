export enum TrustVerdict {
  PerfectStage = 'PerfectStage',
  GoodStage = 'GoodStage',
  LowerStage = 'LowerStage',
  BadStage = 'BadStage',
  AwfulStage = 'AwfulStage',
  CertifiedStage = 'CertifiedStage',
  VerifiedStage = 'VerifiedStage',
}

export interface TrustAnalytics {
  trust_score: number
  mod_trust_score: number
  user_id: number
  report_creation_date: number
  verdict: TrustVerdict
  factors: Factor[]
  correction_version: number
  issuer: Issuer
}

export interface Factor {
  sampler: string
  score: number
  additional_score: number
  max_score: number
  expando?: Expando
}

export interface Expando {
  gradient_date: number
  gradient_time: string
  polynomial_date: number
  polynomial_time: string
}

export interface Issuer {
  service_account_id: string
  id: string
  report: Report
  report_id: string
  kind: string
}

export interface Report {
  id: string
  discover: Discover
  user_id: number
  raw_message_id: number
  issuer_id: string
}

export interface Discover {
  message_id: number
  user_id: number
}
