export interface Logger {
    isSilent: () => boolean
    info: (...msgs: unknown[]) => unknown
    warn: (...msgs: unknown[]) => unknown
    error: (...msgs: unknown[]) => unknown
}

export type Acknowledgment = {
    name: string
    type: (
		"npm" 
		| "node" 
		| "mdn"
        | "rust"
        | "crates.io"
	)
    url: string
}
