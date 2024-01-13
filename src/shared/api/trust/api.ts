import wretch from 'wretch'
import QueryStringAddon from 'wretch/addons/queryString'
import { env } from '../../env'
import { TrustAPIException } from './exceptions'

export const api = wretch(env.api.trust.url)
  .addon(QueryStringAddon)
  .auth(env.api.trust.token)
  .catcherFallback(async (error) => {
    const isException = error.json?.code
    if (!isException) throw error
    throw new TrustAPIException(error.json.code)
  })
