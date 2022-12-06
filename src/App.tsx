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
import {Shabah} from "../sharedLib/shabah"

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

const sleep = (milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds))

import type {AppController} from "./utils"

const  App = ({appController}: {appController: AppController}) => {
  const [showProgress, setShowProgress] = useState(false)
  const [progressMsg, setProgressMsg] = useState("")
  const [downloadProgress, setDownloadProgress] = useState(0)

  const gatherAssets = async () => {
    setShowProgress(true)
    setProgressMsg("Check for Updates...")
    const title = import.meta.env.VITE_APP_TITLE
    await appController.checkForUpdates()
    if (!appController.updatesAvailable()) {
      return
    }
    setProgressMsg("Found updates")
    await appController.execUpdates({
      onProgress: ({downloaded, total, latestFile}) => {
        setProgressMsg(`Fetching ${latestFile}`)
        const rawPercent = Math.floor((downloaded / total) * 100)
        const percent = Math.max(rawPercent, 1)
        setDownloadProgress(percent)
        document.title = `(${percent}%) ${title}`
      },
    })
    setDownloadProgress(100)
    document.title = `(100%) ${title}`
    setProgressMsg("Finished...")
    await sleep(1_000)
    setProgressMsg("Installing...")
    document.title = title
    console.info(log.name, "successfully fetched assets! Opening App...")
    const launchRes = await appController.launchApp("appShell")
    if (launchRes.success) {
      console.info(log.name, "closing now...")
      return
    }
    console.error(log.name, `couldn't launch app-shell, reason: ${launchRes.msg}`)
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
