import { api } from './api'
import { TrustAnalytics } from './types'

export interface GetTrustAnalyticsPayload {
  telegramId: number
  messageId?: number
}

export const getTrustAnalytics = (payload: GetTrustAnalyticsPayload) => {
  return api
    .url(`/trust/${payload.telegramId}`)
    .query({ messageId: payload.messageId })
    .get()
    .json<TrustAnalytics>()
}
