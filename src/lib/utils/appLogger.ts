import {Logger} from "../types/app"

type AppLoggerConfig = {
    silent: boolean
    name: string
}

export class AppLogger implements Logger {
	silent: boolean
	name: string

	constructor(config: AppLoggerConfig) {
		const {silent, name} = config
		this.silent = silent
		this.name = name
	}

	private prefix() {
		return `[${this.name}]`
	}

	isSilent(): boolean {
		return this.silent
	}

	info(...messages: unknown[]): void {
		if (!this.silent) {
			console.info(this.prefix(), ...messages)
		}
	}

	warn(...messages: unknown[]): void {
		console.warn(this.prefix(), ...messages)
	}

	error(...messages: unknown[]): void {
		console.error(this.prefix(), ...messages)
	}
}