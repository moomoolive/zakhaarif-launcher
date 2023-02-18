import {webBackgroundFetchDownloadManager} from "./downloadManager/backgroundFetch"
import {webCacheFileCache} from "./fileCache/webCache"
import {webFetch} from "./networkRequest/webFetch"
import type {DownloadClientAdaptors} from "./utilities"

export const webAdaptors = (
    fileCacheName: string,
    virtualFileCacheName: string
): DownloadClientAdaptors => {
    return {
        fileCache: webCacheFileCache(fileCacheName),
        networkRequest: webFetch(),
        downloadManager: webBackgroundFetchDownloadManager(),
        virtualFileCache: webCacheFileCache(virtualFileCacheName)
    }
}