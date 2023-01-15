export class Result<T, Status extends boolean = true> {
    static ok = <R>(data: R) => new Result(data, "", true)
    static err = (msg: string) => new Result(null, msg, false)

    readonly msg: string
    readonly data: Status extends true ? T : null
    readonly ok: Status

    private constructor(
        data: Status extends true ? T : null, 
        msg: string, 
        ok: Status
    ) {
      this.msg = msg
      this.data = data
      this.ok = ok
    }
}