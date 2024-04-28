export class FakeIMGAPIException extends Error {
  name = 'FakeIMGAPIException'
  code: string

  constructor(code: string) {
    super('Fake IMG API Exception')
    this.code = code
  }
}
