import wretch from 'wretch'
import QueryStringAddon from 'wretch/addons/queryString'
import { env } from '../../env'

export const api = wretch(env.api.trust.url)
  .addon(QueryStringAddon)
  .auth(env.api.trust.token)
