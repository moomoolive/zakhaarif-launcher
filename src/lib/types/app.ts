export interface Logger {
    isSilent: () => boolean
    info: (...msgs: unknown[]) => unknown
    warn: (...msgs: unknown[]) => unknown
    error: (...msgs: unknown[]) => unknown
}