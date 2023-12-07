export class TrustAPIException extends Error {
  name = 'TrustAPIException'
  code: string

  constructor(code: string) {
    super('Trust API Exception')
    this.code = code
  }
}
