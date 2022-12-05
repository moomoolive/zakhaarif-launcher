export const sleep = (milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds))

export const toPercent = (dividend: number, divisor: number) => Math.floor((dividend / divisor) * 100)

export const roundDecimal = (num: number, decimals: number) => {
    const factor = 10 ** decimals
    return Math.round(num * factor) / factor
}

export class io<T> {
    msg: string
    success: boolean
    data: T | null
  
    constructor(
      success: boolean,
      msg: string,
      data: T | null
    ) {
      this.success = success
      this.msg = msg
      this.data = data
    }
}

export const enum bytes {
    per_mb = 1_000_000
}
  
  