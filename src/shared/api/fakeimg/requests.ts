import { api } from './api'

export interface GetInitialsPlaceholderAvatarPayload {
  firstName: string
  lastName?: string
}
export const getInitialsPlaceholderAvatar = (
  payload: GetInitialsPlaceholderAvatarPayload,
) => {
  const initials = [payload.firstName, payload?.lastName ?? '']
    .filter(Boolean)
    .map((n) => n[0])
    .join(' ')
    .toUpperCase()
  return api
    .url(`/100x100/cccccc/909090`)
    .query({
      text: initials,
    })
    .get()
    .arrayBuffer()
    .catch(() => null)
}
