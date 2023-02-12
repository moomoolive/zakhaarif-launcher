export type CargoRequestError = (
    | "insufficent-storage"
    | "invalid-encoding"
    | "invalid-resource-detected"
    | "network-error"
    | "catch-all-error"
    | "not-found"
    | "malformed-url"
    | "invalid-manifest-url"
    | "analyzing"
    | "manifest-already-exists"
    | "none"
)

export const cargoErrorToText = (error: CargoRequestError) => {
    switch (error) {
        case "manifest-already-exists":
            return "Add-on already exists"
        case "invalid-manifest-url":
            return "Invalid Add-on url"
        case "insufficent-storage":
            return "Insufficent disk space"
        case "invalid-encoding":
            return "Add-on is encoded incorrectly"
        case "invalid-resource-detected":
            return "Add-on has unreachable files"
        case "network-error":
            return "Server could not provide Add-on"
        case "not-found":
            return "Add-on does not exist"
        case "malformed-url":
            return "Invalid url"
        case "analyzing":
            return "Loading..."
        case "catch-all-error":
            return "Couldn't get Add-on"
        default:
            return ""
    }
}
