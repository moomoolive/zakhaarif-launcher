import { useState, useEffect } from 'react'
import {
  Button, 
  IconButton, 
  Menu,
  MenuItem,
  Tooltip,
  CircularProgress,
  Box,
  Typography,
  CircularProgressProps,
  Collapse,
  createTheme,
  ThemeProvider
} from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import type {AppController} from "./utils"
import LoadingIcon from "@mui/icons-material/Loop"
import VersionIcon from "@mui/icons-material/Source"
import TerminalIcon from "@mui/icons-material/Terminal"
import {TerminalUi} from "./terminalUi"

const enum log {
  name = "[🚀 launcher]:"
}

const sleep = (milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds))

const launcherTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#0077c0"
    },
    secondary: {
      main: "#c4ced4"
    },
  }
})

const  App = ({appController}: {appController: AppController}) => {
  const [showProgress, setShowProgress] = useState(false)
  const [progressMsg, setProgressMsg] = useState("")
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [settingsMenuElement, setSettingsMenuElement] = useState<null | HTMLElement>(null)
  const [showTerminal, setShowTerminal] = useState(false)

  const closeSettings = () => setSettingsMenuElement(null)

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
  }

  return (
    <div>
      <main className="bg-neutral-800">
        <ThemeProvider theme={launcherTheme}>
          <div className="relative text-center z-0 w-screen h-screen flex justify-center items-center">
            <div className="relative z-0">
              {showTerminal ? <>
                <TerminalUi/>
              </> : <></>}

              <div className="fixed top-2 left-0">
                <Tooltip title="Settings">
                  <Button
                    variant="text"
                    size="small"
                    onClick={(e) => {
                      if (settingsMenuElement) {
                        closeSettings()
                      } else {
                        setSettingsMenuElement(e.currentTarget)
                      }
                    }}
                  >
                    <SettingsIcon/>
                  </Button>
                </Tooltip>

                <Menu
                  anchorEl={settingsMenuElement}
                  open={!!settingsMenuElement}
                  onClose={closeSettings}
                  className="text-xs"
                >
                  <MenuItem 
                    className="text-xs"
                    onClick={() => {
                      setShowTerminal(true)
                      closeSettings()
                    }}
                  >
                    <span className="mr-2">
                      <TerminalIcon/>
                    </span>
                    Terminal
                  </MenuItem>
                </Menu>
              </div>

              <div>
                <Button
                  variant="contained"
                  onClick={gatherAssets}
                  className="bg-green-700"
                >
                  {!showProgress 
                    ? "Enter"
                    : <span className='animate-spin'>
                      <LoadingIcon/>
                      </span>
                  }
                </Button>
              </div>

              <div className={`mt-4 ${showProgress ? "" : "invisible"}`}>
                <Collapse in={showProgress}>
                  <div className="text-xs text-gray-400 mt-2 mb-4">
                      {downloadProgress.toFixed(1) + "%"}
                  </div>

                  <div className="mt-2 text-sm">
                    {progressMsg}
                  </div>
                </Collapse>
              </div>

              <div className="fixed z-10 text-xs bottom-2 left-2 text-gray-500">
                <span className="mr-2 text-blue-400">
                  <VersionIcon/>
                </span>
                {"v0.1.0-beta.0"}
              </div>
            </div>
          </div>
        </ThemeProvider>
      </main>
    </div>
  )
}

export default App
