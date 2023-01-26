import type {Shabah} from "@/lib/shabah/wrapper"

export type TopLevelAppProps = Readonly<{
    setTerminalVisibility: (visible: boolean) => void
    downloadClient: Shabah
}>