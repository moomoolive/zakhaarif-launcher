export const stripRelativePath = (url: string): string => {
	if (url.length < 1) {
		return ""
	}
	if (
		!url.startsWith("/")
        && !url.startsWith("./") 
        && !url.startsWith("../")
	) {
		return url
	}
	const split = url.split("/")
	let urlStart = -1
	for (let i = 0; i < split.length; i++) {
		const path = split[i]
		if (path !== "" && path !== "." && path !== "..") {
			urlStart = i
			break
		}
	}
	if (urlStart < 0) {
		return ""
	}
	return split.slice(urlStart).join("/")
}