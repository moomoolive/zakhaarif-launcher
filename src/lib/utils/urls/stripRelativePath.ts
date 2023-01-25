export const stripRelativePath = (url: string) => {
    if (url.startsWith("/")) {
        return url.slice(1)
    } else if (url.startsWith("./")) {
        return url.slice(2)
    } else if (url.startsWith("../")) {
        return url.slice(3)
    } else {
        return url
    }
}