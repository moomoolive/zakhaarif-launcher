export const isUrl = (url: string): boolean => {
	try {
		return !!(new URL(url))
	} catch {
		return false
	}
}