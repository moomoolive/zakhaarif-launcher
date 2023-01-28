import type {Shabah} from "@/lib/shabah/wrapper"

export type TopLevelAppProps = {
    readonly setTerminalVisibility: (visible: boolean) => void
    readonly downloadClient: Shabah
    sandboxInitializePromise: {
        resolve: (value: boolean) => void
        reject: (reason?: unknown) => void
        promise: Promise<boolean>
    }
}