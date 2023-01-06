import type {Shabah} from "@/lib/shabah/wrapper"

export type TopLevelAppProps = Readonly<{
    showLauncher: (value: boolean) => void
    setTerminalVisibility: (visible: boolean) => void
    downloadClient: Shabah
}>