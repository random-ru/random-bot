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
}
