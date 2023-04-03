import type {
	ConsoleCommandInputDeclaration,
	ParsedConsoleCommandInput,
} from "zakhaarif-dev-tools"

export function validateCommandInput<
	T extends ConsoleCommandInputDeclaration
>(
	types: T,
	input: ParsedConsoleCommandInput<T>,
	commandName: string
): string {
	if (
		typeof input !== "object" 
		|| input === null
	) {
		return `[${commandName}] console command input must be an "object". Got "${input === null ? "null" : typeof input}"`
	}

	const allKeys = Object.keys(types)
	const requiredKeys = []
	for (let i = 0; i < allKeys.length; i++) {
		const key = allKeys[i]
		const type = types[key]
		if (!type.endsWith("?")) {
			requiredKeys.push(key)
		}
	}

	const inputKeys = Object.keys(input)
	if (inputKeys.length < requiredKeys.length) {
		const missingArgs = []
		for (let i = 0; i < requiredKeys.length; i++) {
			const required = requiredKeys[i]
			if (input[required] === undefined) {
				missingArgs.push(`${required} (${types[required]})`)
			}
		}
		return `[${commandName}] missing required arguments: ${missingArgs.join(", ")}`
	}

	const invalidTypes = []

	for (let i = 0; i < allKeys.length; i++) {
		const targetKey = allKeys[i]
		const targetType = types[targetKey]
		const inputValue = input[targetKey]
		const inputType = typeof inputValue
		
		switch (targetType) {
		case "boolean": {
			if (inputType !== "boolean") {
				invalidTypes.push(`expected "${targetKey}" to be a "boolean" got "${typeof inputValue}"`)
			}
			break
		}
		case "boolean?": {
			if (inputType !== "undefined" && inputType !== "boolean") {
				invalidTypes.push(`expected "${targetKey}" to be a "boolean" got "${typeof inputValue}"`)
			}
			break
		}
		case "string": {
			if (inputType !== "string") {
				invalidTypes.push(`expected "${targetKey}" to be a "string" got "${typeof inputValue}"`)
			}
			break
		}
		case "string?": {
			if (inputType !== "undefined" && inputType !== "string") {
				invalidTypes.push(`expected "${targetKey}" to be a "string" got "${typeof inputValue}"`)
			}
			break
		}
		case "number": {
			if (inputType !== "number") {
				invalidTypes.push(`expected "${targetKey}" to be a "number" got "${typeof inputValue}"`)
			}
			break
		}
		case "number?": {
			if (inputType !== "undefined" && inputType !== "number") {
				invalidTypes.push(`expected "${targetKey}" to be a "number" got "${typeof inputValue}"`)
			}
			break
		}
		default:
			break
		}
	}

	if (invalidTypes.length > 0) {
		return `[${commandName}] invalid arguments provided: ${invalidTypes.join(", ")}`
	}

	return ""
}