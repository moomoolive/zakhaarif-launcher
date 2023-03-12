export const type = (val: unknown) => {
	const t = typeof val
	if (t !== "object") {
		return t
	} else if (val === null) {
		return "null"
	} else if (Array.isArray(val)) {
		return "array"
	} else {
		return "object"
	}
}