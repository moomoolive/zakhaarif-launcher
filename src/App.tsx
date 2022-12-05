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
import {
  toPercent, 
  sleep, 
  io
} from "./utils"
import {Shabah} from "./shabah"

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
  const [shabah] = useState(new Shabah({
    apps: {
      appShell: {
        id: 1,
        appRootUrl: import.meta.env.VITE_CARGO_APP_SHELL_ROOT_URL,
        htmlTitle: import.meta.env.VITE_APP_TITLE,
        permissions: {}
      },
      gameCore: {
        id: 2,
        appRootUrl: import.meta.env.VITE_CARGO_GAME_CORE_ROOT_URL,
        htmlTitle: "none",
        permissions: {}
      }
    },
    entry: "appShell",
    mode: "dev"
  }))

  const gatherAssets = async () => {
    setShowProgress(true)
    setProgressMsg("Check for Updates...")
    const title = import.meta.env.VITE_APP_TITLE
    await shabah.checkForUpdates()
    if (!shabah.updatesAvailable()) {
      return
    }
    setProgressMsg("Found updates")
    await shabah.execUpdates({
      onProgress: ({downloaded, total, latestFile}) => {
        setProgressMsg(`Fetching ${latestFile}`)
        const percent = toPercent(downloaded, total)
        const p = percent < 1 ? 1 : percent
        setDownloadProgress(p)
        document.title = `(${p}%) ${title}`
      },
    })
    setDownloadProgress(100)
    document.title = `(100%) ${title}`
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
