export const getFileNameFromUrl = (url: string): string => url.split("/").at(-1) || ""
