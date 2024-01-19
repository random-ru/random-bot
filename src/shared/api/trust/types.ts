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
  accuracy: number
  verdict: TrustVerdict
  report_creation_date: number
  trust_factor: number
  user_id: number
  correction_version: number
  issuer: Issuer
  factors: Factor[]
}

export interface Factor {
  sampler: string
  score: number
  accuracy: number
  max_score: number
  expando?: Expando
}

export interface Expando {
  gradient: Point
  polynomial: Point
}

export interface Point {
  s: number
  t: string
}

export interface Issuer {
  issuer_user_id: number
  id: string
  report: Report
  report_id: string
  kind: string
}

export interface Report {
  id: string
  discover: Discover
  trust_report: TrustReport
  user_id: number
  issuer_id: string
}

export interface Discover {
  message_id: number
  user_id: number
}

export interface TrustReport {
  user_id: number
  report_record_id: string
  id: string
  factors: Factor[]
  accuracy: number
  report_creation_date: number
  verdict: string
}
