import type { DownloadManager, FetchFunction, FileCache } from "../backend"

export type DownloadClientAdaptors = {
    fileCache: FileCache,
    networkRequest: FetchFunction,
    downloadManager: DownloadManager,
    virtualFileCache: FileCache
}