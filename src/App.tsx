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
import {CodeManifest} from "../sharedLib/types"
import {MANIFEST_NAME} from "../sharedLib/consts"

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

class io<T> {
  msg: string
  success: boolean
  data: T | null

  constructor(
    success: boolean,
    msg: string,
    data: T | null
  ) {
    this.success = success
    this.msg = msg
    this.data = data
  }
}

const enum bytes {
  per_mb = 1_000_000
}

const roundDecimal = (num: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round(num * factor) / factor
}

const toPercent = (dividend: number, divisor: number) => Math.floor((dividend / divisor) * 100)

const logger = {
  info: (...msgs: any[]) => console.info("[launcher]:", ...msgs),
  error: (...msgs: any[]) => console.error("[launcher]:", ...msgs)
}

const sleep = (milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds))

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
  logger.error(msg)
  return new io(false, msg, null)
}


function App() {
  const [showProgress, setShowProgress] = useState(false)
  const [progressMsg, setProgressMsg] = useState("")
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [count, setCount] = useState(0)

  const gatherAssets = async () => {
    setShowProgress(true)
    setProgressMsg("Gathering Requirements...")
    const appManifest = await (async () => {
      try {
        const res = await fetch(import.meta.env.VITE_MANIFEST_URL)
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
    })()
    if (!appManifest.data || !appManifest.success) {
      logger.error("couldn't get app manifest, reason:", appManifest.msg)
      return
    }
    const totalAppSize = appManifest.data.body.files.reduce((total, {bytes}) => {
      return parseFloat(bytes) + total
    }, appManifest.data.size)
    logger.info("successfully fetched app manifest, app_size is", roundDecimal(totalAppSize / bytes.per_mb, 2), "mb")
    let downloadedBytes = appManifest.data.size
    setDownloadProgress(1)
    const title = import.meta.env.VITE_APP_TITLE
    document.title = `(1%) ${title}`
    const appFiles = appManifest.data.body.files
    const baseUrl = import.meta.env.VITE_MANIFEST_URL.split(MANIFEST_NAME)[0]
    for (let i = 0; i < appFiles.length; i++) {
      const {name, bytes} = appFiles[i]
      const url = baseUrl + name
      setProgressMsg(`Fetching ${name}`)
      const file = await retryPromise(() => fetch(url, {method: "GET"}), 3)
      await sleep(10_000)
      downloadedBytes += parseFloat(bytes)
      const p = toPercent(downloadedBytes, totalAppSize)
      setDownloadProgress(p)
      document.title = `(${p}%) ${title}`
    }
    setProgressMsg("Finished...")
    await sleep(1_000)
    setProgressMsg("Installing...")
    document.title = title
    logger.info("successfully fetched assets!")
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
