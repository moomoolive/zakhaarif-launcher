class Logger {
    readonly name: string

    constructor(name: string) {
        this.name = name
    }

    private identity() {
        return `[${this.name}]:`
    }

    info(...msgs: any[]) {
        console.info(this.identity(), ...msgs)
    }

    warn(...msgs: any[]) {
        console.warn(this.identity(), ...msgs)
    }

    error(...msgs: any[]) {
        console.error(this.identity(), ...msgs)
    }
}

export const appShell = new Logger("app-shell")