export enum TrustVerdict {
  Unknown = 'Unknown',
  PerfectStage = 'PerfectStage',
  GoodStage = 'GoodStage',
  LowerStage = 'LowerStage',
  BadStage = 'BadStage',
  AwfulStage = 'AwfulStage',
}

export interface TrustAnalytics {
  accuracy: number
  verdict: TrustVerdict
}
