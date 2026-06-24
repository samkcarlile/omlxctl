export class OmlxApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly detail: string,
  ) { super(`oMLX API error ${status} at ${path}: ${detail}`) }
}
