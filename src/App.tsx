import { useState, useEffect } from 'react'
import {
  Button, 
  IconButton, 
  Menu,
  MenuItem,
  CircularProgress,
  Box,
  Typography,
  CircularProgressProps,
  Collapse,
} from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import type {
  CodeManifest,
  AppEntryPointer
} from "../sharedLib/types"
import {
  MANIFEST_NAME,
  headers,
  APP_CACHE,
  CURRENT_APP_DIR,
  NO_EXPIRATION,
  sources,
  CURRENT_APP_ENTRY_PARAMS,
} from "../sharedLib/consts"
import {
  bytes, 
  roundDecimal, 
  toPercent, 
  sleep, 
  io
} from "./utils"
import {validateManifest} from "../sharedLib/validators"

const CircularProgressWithLabel = (
  props: CircularProgressProps & { value: number },
) => {
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress variant="determinate" {...props} />
      <Box
        sx={{
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="caption"
          component="div"
          color="text.secondary"
        >{`${Math.round(props.value)}%`}</Typography>
      </Box>
    </Box>
  )
}

const enum log {
  name = "[🚀 launcher]:"
}

async function retryPromise<T>(p: () => Promise<T>, count: number) {
  let tryCount = 0
  let errorMsg = ""
  while (tryCount < count) {
    try {
      return new io(true, "sucess", await p())
    } catch (err) {
      if (tryCount >= count - 1) {
        errorMsg = (err as Error || "unknown error").toString()
      }
      tryCount++
    }
  }
  const msg = `Error fetching io operation after ${count} retries, err:${errorMsg}`
  console.error(log.name, msg)
  return new io(false, msg, null)
}


const  App = ({
  openApp = async () => true
} = {}) => {
  const [showProgress, setShowProgress] = useState(false)
  const [progressMsg, setProgressMsg] = useState("")
  const [downloadProgress, setDownloadProgress] = useState(0)

  const gatherAssets = async () => {
    setShowProgress(true)
    setProgressMsg("Gathering Requirements...")
    const prelimUrl = import.meta.env.VITE_CARGO_ROOT_URL
    const baseUrl = prelimUrl.endsWith("/")
      ? prelimUrl
      : prelimUrl + "/"
    const manifestUrl = baseUrl + MANIFEST_NAME
    const appManifest = await (async (url: string) => {
      try {
        const res = await fetch(url, {method: "GET"})
        if (!res.ok) {
          return new io(false, "non-network error", null)
        }
        const body = await res.json() as CodeManifest
        const rawSize = res.headers.get("content-length")
        const size = rawSize ? parseInt(rawSize, 10) : 0
        return new io(
          true,
          "success",
          {body, size}
        )
      } catch (err) {
        return new io(false, "network error", null)
      }
    })(manifestUrl)
    if (!appManifest.data || !appManifest.success) {
      console.error(log.name, "couldn't get app manifest, reason:", appManifest.msg)
      return
    }
    const {pkg, errors} = validateManifest(
      appManifest.data.body, false
    )
    if (errors.length > 0) {
      console.error(log.name, `input url ${manifestUrl} is not a valid ${MANIFEST_NAME} format. Errors: ${errors.join()}`)
      return
    }
    console.log(pkg)
    const manifestSize = appManifest.data.size
    const totalAppSize = pkg.files.reduce((total, {bytes}) => bytes + total, manifestSize)
    if (!import.meta.env.PROD) {
      console.info(log.name, "dev mode detected, purging all cache files")
      await caches.delete(APP_CACHE)
    }
    console.info(log.name, "successfully fetched app manifest, app_size is", roundDecimal(totalAppSize / bytes.per_mb, 2), "mb")
    let downloadedBytes = manifestSize
    setDownloadProgress(1)
    const title = import.meta.env.VITE_APP_TITLE
    document.title = `(1%) ${title}`
    const appFiles = pkg.files
    const targetCache = await caches.open(APP_CACHE)
    const failedRequests = []
    const appEntryUrl = CURRENT_APP_DIR + pkg.entry
    const originalEntryUrl = baseUrl + pkg.entry 
    const appEntryPointer: AppEntryPointer = {
      appShell: {
        url: appEntryUrl, 
        originalUrl: originalEntryUrl
      }
    }
    await targetCache.put(
      CURRENT_APP_ENTRY_PARAMS, 
      new Response(JSON.stringify(appEntryPointer), {
        status: 200,
        statusText: "OK",
        headers: {
          "Content-Type": "application/json",
          [headers.insertedAt]: Date.now().toString(),
          [headers.expiration]: NO_EXPIRATION.toString(),
          [headers.source]: sources.launcher.toString(),
          [headers.content_length]: appManifest.data.size.toString(),
          [headers.sw_cache]: "1"
        }
      })
    )
    console.info(log.name, `Inserted app entry ptr (ptr->${appEntryUrl})`)
    for (let i = 0; i < appFiles.length; i++) {
      const {name, bytes} = appFiles[i]
      const requestUrl = baseUrl + name
      setProgressMsg(`Fetching ${name}`)
      const file = await retryPromise(() => {
        return fetch(requestUrl, {method: "GET"})
      }, 3)
      if (!file.data || !file.success) {
        failedRequests.push({...file, name, requestUrl})
        console.error(log.name, "failed to cache asset @", requestUrl, "retrying later")
        continue
      }
      downloadedBytes += bytes
      const p = toPercent(downloadedBytes, totalAppSize)
      setDownloadProgress(p)
      document.title = `(${p}%) ${title}`
      const fileType = file.data.headers.get("content-type") || "text/javascript"
      const response = new Response(await file.data.text(), {
        status: 200,
        statusText: "OK",
        headers: {
          [headers.insertedAt]: Date.now().toString(),
          [headers.expiration]: NO_EXPIRATION.toString(),
          [headers.source]: sources.launcher.toString(),
          [headers.content_length]: bytes.toString(),
          "Content-Type": fileType,
          [headers.sw_cache]: "1"
        }
      })
      const cacheUrl = CURRENT_APP_DIR + name
      await targetCache.put(cacheUrl, response)
      console.info(log.name, `inserted file ${name} (${requestUrl}) into virtual drive (${cacheUrl})`)
    }
    setProgressMsg("Finished...")
    await sleep(1_000)
    setProgressMsg("Installing...")
    document.title = title
    console.info(log.name, "successfully fetched assets! Opening App...")
    const controllerResponse = await openApp()
    if (controllerResponse) {
      console.info(log.name, "closing now...")
      return
    }
  }

  return (
    <div>
      <main className="bg-gray-500">
        <div className="relative text-center z-0 w-screen h-screen flex justify-center items-center">
            <div>
              <div>
                <Button
                  variant="contained"
                  disabled={showProgress}
                  onClick={gatherAssets}
                >
                  Enter
                </Button>
              </div>

              <div className={`mt-4`}>
                <Collapse in={showProgress}>
                  <CircularProgressWithLabel 
                    variant="determinate" 
                    value={downloadProgress}
                  />
                  <div className="mt-2 text-sm">
                    {progressMsg}
                  </div>
                </Collapse>
              </div>
            </div>
        </div>
      </main>
    </div>
  )
}

export default App
