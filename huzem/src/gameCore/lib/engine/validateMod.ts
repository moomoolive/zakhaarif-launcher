import * as s from "superstruct"

const modValidator = s.object({
	data: s.object({
		name: s.string(),
		dependencies: s.optional(
			s.array(s.object({
				name: s.string(),
				type: s.optional(s.union([
					s.literal("required"), 
					s.literal("optional")
				])),
				version: s.optional(s.string())
			}))
		),
		resources: s.optional(s.record(s.string(), s.string())),
		components: s.optional(
			s.record(
				s.string(), 
				s.union([
					s.literal("f32"), 
					s.literal("i32"), 
					s.literal("u32")
				])
			)
		),
		archetypes: s.optional(
			s.record(
				s.string(), 
				s.record(s.string(), s.number())
			)
		),
		state: s.optional(s.func())
	}),
	onInit: s.optional(s.func()),
	onBeforeGameLoop: s.optional(s.func()),
	onExit: s.optional(s.func())
})

export type ModPackageValidationResponse = {
    ok: boolean,
    error: string
}

const validateResponse: ModPackageValidationResponse = {
	ok: false,
	error: ""
} 

export function validateMod(
	mod: unknown,
): ModPackageValidationResponse {
	const response = validateResponse
	const [error] = s.validate(mod, modValidator)
	if (!error) {
		response.ok = true
		response.error = ""
		return response
	}
	response.ok = false
	response.error = `${error.path.length < 1 ? "mod" : `mod field "${error.path.join(".")}"`} is invalid. Expected "${error.type}" got "${error.value === null ? "null" : typeof error.value}"`
	return response
}