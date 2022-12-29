import {extensionToMime} from "./generatedSources"

export type {FileExtension, Mime} from "./generatedSources"

export const urlToMime = (url: string) => {
    const split = url.split(".")
    if (split.length < 2) {
        return ""
    }
    const extension = split.at(-1)
    if (!extension || extension.length < 1) {
        return ""
    }
    return extensionToMime(extension)
}
