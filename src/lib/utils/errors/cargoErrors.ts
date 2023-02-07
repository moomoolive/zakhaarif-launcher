export type CargoRequestError = (
    | "insufficent-storage"
    | "invalid-encoding"
    | "package-has-invalid-resource"
    | "network-error"
    | "catch-all-error"
    | "not-found"
    | "malformed-url"
    | "analyzing"
    | "none"
)

export const cargoErrorToText = (error: CargoRequestError) => {
    switch (error) {
        case "insufficent-storage":
            return "Insufficent disk space"
        case "invalid-encoding":
            return "Package is encoded incorrectly"
        case "package-has-invalid-resource":
            return "Package has unreachable files"
        case "network-error":
            return "Server could not provide package"
        case "not-found":
            return "Package does not exist"
        case "malformed-url":
            return "Invalid url"
        case "analyzing":
            return "Loading..."
        case "catch-all-error":
            return "Couldn't get package"
        default:
            return ""
    }
} 