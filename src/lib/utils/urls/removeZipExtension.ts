export const ZIP_EXTENSION_LENGTH = 3

export function isZipFile(url: string): boolean {
	const zipExtension = url.slice(-ZIP_EXTENSION_LENGTH)
	switch (zipExtension) {
	case ".gz":
		return true
	default:
		return false
	}
}


export function removeZipExtension(url: string): string {
	if (isZipFile(url)) {
		return url.slice(0, -ZIP_EXTENSION_LENGTH)
	}
	return url
}