import wretch from 'wretch'
import QueryStringAddon from 'wretch/addons/queryString'
import { FakeIMGAPIException } from './exceptions'

export const api = wretch('https://fakeimg.pl')
  .addon(QueryStringAddon)
  .catcherFallback(async (error) => {
    const isException = error.json?.code
    if (!isException) throw error
    throw new FakeIMGAPIException(error.json.code)
  })
