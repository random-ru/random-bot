import wretch from 'wretch'
import QueryStringAddon from 'wretch/addons/queryString'
import { env } from '../../env'
import { TrustAPIException } from './exceptions'

export const api = wretch(env.api.trust.url)
  .addon(QueryStringAddon)
  .auth(env.api.trust.token)
  .catcherFallback(async (error) => {
    try {
      const json = await error.response.json()
      const isException = json?.code
      if (!isException) throw new Error('Not an exception')
      throw new TrustAPIException(json.code)
    } catch {
      throw error
    }
  })
