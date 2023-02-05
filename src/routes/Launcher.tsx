import { useState, useEffect, useRef } from 'react'
import {
  Button, 
  Menu,
  MenuItem,
  Tooltip,
  Collapse,
} from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
  faTimes, faCheck, faBox, faCodeBranch,
  faLink, faTerminal, faFolderMinus
} from "@fortawesome/free-solid-svg-icons"
import {faChrome} from "@fortawesome/free-brands-svg-icons"
import {BYTES_PER_GB} from "../lib/utils/consts/storage"
import {Shabah} from "../lib/shabah/downloadClient"
import {roundDecimal} from "../lib/math/rounding"
import {featureCheck} from "../lib/utils/appFeatureCheck"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {sleep} from "../lib/utils/sleep"
import {APP_CARGO_ID, GAME_EXTENSION_ID, STANDARD_MOD_ID} from "../config"
import {useAppShellContext} from "./store"
import {useNavigate} from "react-router-dom"
import {APP_LAUNCHED} from "../lib/utils/localStorageKeys"
import { useEffectAsync } from '../hooks/effectAsync'
import LoadingIcon from '../components/LoadingIcon'

const UnsupportedFeatures = (): JSX.Element => {
  const {current: features} = useRef(featureCheck() as ReadonlyArray<{name: string, supported: boolean, hardwareRelated?: boolean}>)
  const [showFeatureDetails, setShowFeatureDetails] = useState(false)

  const hardwareRequirementNotMet = features.some((feature) => {
    return feature.hardwareRelated && !feature.supported
  })

  const softwareRequirementsNotMet = features.some((feature) => {
    return !feature.hardwareRelated && !feature.supported
  })

  let requirementText = ""

  if (hardwareRequirementNotMet && softwareRequirementsNotMet) {
    requirementText = "device & browser"
  } else if (hardwareRequirementNotMet) {
    requirementText = "device"
  } else if (softwareRequirementsNotMet) {
    requirementText = "browser"
  }

  return <>
    <div className="text-sm text-yellow-500 mb-3 mt-6">
      {`Your ${requirementText} ${softwareRequirementsNotMet && hardwareRequirementNotMet ? "don't" : "doesn't"} support all required features.`}<br/>
      {softwareRequirementsNotMet ? <>
        {"Try using the latest version of Chrome"}
        <span className="ml-2">
          <FontAwesomeIcon 
            icon={faChrome}
          />
        </span>
      </> : ""}
    </div>

    <div>
      <Button 
        size="small"
        color="info"
        onClick={() => setShowFeatureDetails(current => !current)}
      >
        {showFeatureDetails ? "Hide" : "Details"}
      </Button>
    </div>

    <Collapse in={showFeatureDetails}>
      <div className="max-w-sm mx-auto text-left">
          {features.filter(({supported}) => !supported).map((feature, i) => {
            const hardwareRelated = feature.hardwareRelated || false
            return <div
              key={`feature-check-${i}`}
              className="text-sm mb-1"
            >
              <span className="mr-2">
                {`${hardwareRelated ? "💻" : "🌍"} `}
                {feature.name
                  .split("-")
                  .map((str) => str[0].toUpperCase() + str.slice(1))
                  .join(" ")}
              </span>
              {feature.supported ? <span 
                className="text-green-500"
              >
                <FontAwesomeIcon 
                  icon={faCheck}
                />  
              </span> : <span
                className="text-red-500"
              >
                <FontAwesomeIcon 
                  icon={faTimes}
                />  
              </span>}
              <span className="ml-2 text-xs text-neutral-500">
                {hardwareRelated ? "(hardware)" : "(browser)"}
              </span>
            </div>
          })}
      </div>
    </Collapse>
  </>
}

const toGigabytes = (number: number) => {
  const decimal = number / BYTES_PER_GB
  const rounded = roundDecimal(decimal, 2)
  return Math.max(rounded, 0.01)
}

const toPercent = (fraction: number, decimals: number) => {
  return roundDecimal(fraction * 100, decimals)
}

const progressIndicator = (downloaded: number, total: number) => {
  return <div>
    <div>Updating App...</div>
      <div className="mt-1.5 flex items-center justify-center text-xs text-neutral-400">
        <div className="mr-2 text-blue-500 animate-bounce">
          <FontAwesomeIcon
            icon={faBox}
          />
        </div>
        <div>
          {toGigabytes(downloaded)} GB / {toGigabytes(total)} GB 
        </div>
        <div className="ml-2 text-blue-500">
          <span></span>{`(${toPercent(downloaded / total, 1)}%)`}
        </div>
      </div>
  </div>
}

type PwaInstallPrompt = {
  prompt: () => void
  userChoice: () => Promise<"accepted" | "dismissed">
}

type PwaInstallEvent = Event & PwaInstallPrompt

const APP_TITLE = "Game Launcher"
let pwaInstallPrompt = null as null | PwaInstallEvent

const STANDARD_CARGOS = [
  {
    canonicalUrl: import.meta.env.VITE_APP_LAUNCHER_CARGO_URL, 
    id: APP_CARGO_ID
  },
  {
    canonicalUrl: import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL,
    id: GAME_EXTENSION_ID
  },
  {
    canonicalUrl: import.meta.env.VITE_APP_STANDARD_MOD_CARGO_URL,
    id: STANDARD_MOD_ID
  }
] as const

const NO_LISTENER = -1

type LauncherState = (
  "uninstalled"
  | "cached"
  | "error"
  | "loading"
)

const LauncherRoot = () => {
  const confirm = useGlobalConfirm()
  const app = useAppShellContext()
  const {setTerminalVisibility, downloadClient} = app
  const navigate = useNavigate()

  const [progressMsg, setProgressMsg] = useState("")
  const [settingsMenuElement, setSettingsMenuElement] = useState<null | HTMLElement>(null)
  const [downloadError, setDownloadError] = useState("")
  const [currentAppVersion, setCurrentAppVersion] = useState(Shabah.NO_PREVIOUS_INSTALLATION)
  const [corePackagesStatus, setCorePackagesStatus] = useState([
    {id: "launcher", installed: false, upToDate: true},
    {id: "game-extension", installed: false, upToDate: true},
    {id: "standard-mod", installed: false, upToDate: true},
  ])
  const [launcherState, setLauncherState] = useState<LauncherState>("uninstalled")
  const [startButtonText, setStartButtonText] = useState("Install") 
  
  const {current: launchApp} = useRef(() => {
    sessionStorage.setItem(APP_LAUNCHED, "1")
    navigate("/launch")
  })
  const updateListener = useRef(NO_LISTENER)
  const {current: allFeaturesSupported} = useRef(
    featureCheck().every((feature) => feature.supported)
  )

  const closeSettings = () => setSettingsMenuElement(null)

  const gatherAssets = async () => {
    if (
      import.meta.env.PROD 
      && !!sessionStorage.getItem(APP_LAUNCHED)
    ) {
      launchApp()
      return
    }
    setDownloadError("")
    setLauncherState("loading")
    setProgressMsg("Checking for Updates...")

    const updates = await Promise.all([
      downloadClient.checkForCargoUpdates(STANDARD_CARGOS[0]),
      downloadClient.checkForCargoUpdates(STANDARD_CARGOS[1]),
      downloadClient.checkForCargoUpdates(STANDARD_CARGOS[2]),
    ] as const)
    const [launcher, gameExtension, standardMod] = updates 
    console.log(
      "launcher", launcher,
      "game-extension", gameExtension,
      "std-mod", standardMod
    )

    if (!launcher.updateAvailable()) {
      launchApp()
      return
    }

    await downloadClient.cacheRootDocumentFallback()
    setProgressMsg(`Update Found! Queuing...`)
    const listenerId = app.addEventListener("downloadprogress", (progress) => {
      console.log("got progress", progress)
    })
    updateListener.current = listenerId
    const queueResponse = await downloadClient.executeUpdates(
      updates,
      `game core`,
    )

    if (queueResponse.data !== Shabah.STATUS.updateQueued) {
      setLauncherState("error")
      setDownloadError("Couldn't Queue Update")
      setStartButtonText("Retry")
      app.removeEventListener("downloadprogress", listenerId)
      return
    }
    setProgressMsg("Updating...")
    document.title = "Updating..."
    setCurrentAppVersion(launcher.versions().old)
  }

  useEffect(() => {
    return () => {
      if (updateListener.current === NO_LISTENER) {
        return
      }
      app.removeEventListener("downloadprogress", updateListener.current)
    }
  })

  useEffectAsync(async () => {
    const statuses = await Promise.all([
      downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[0].canonicalUrl),
      downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[1].canonicalUrl),
      downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[2].canonicalUrl),
    ] as const)
    const [launcherStatus] = statuses
    
    const notInstalled = statuses.some((cargo) => !cargo)
    if (!launcherStatus || notInstalled) {
      setCorePackagesStatus(corePackagesStatus.map(
        (status) => ({...status, installed: false})
      ))
      setStartButtonText("Install")
      setLauncherState("uninstalled")
      return
    }

    setCurrentAppVersion(launcherStatus.version)
    const errorOccurred = statuses.some(
      (cargo) => cargo?.state === "update-aborted" || cargo?.state === "update-failed"
    )
    if (errorOccurred) {
      setDownloadError("Update Failed...")
      setLauncherState("error")
      setStartButtonText("Retry")
      return
    }

    const isUpdating = statuses.some(
      (cargo) => cargo?.state === "updating"
    )
    if (isUpdating) {
      setLauncherState("loading")
      return
    }

    
    if (launcherStatus.state === "cached") {
      setLauncherState("cached")
      setStartButtonText("Start")
      return
    }
  }, [])

  return (
    <div 
      id="launcher-root"
      className="relative text-center z-0 w-screen h-screen flex justify-center items-center"
    >
        <div className="relative z-0">
            <div id="launcher-menu" className="fixed top-2 left-0">
              <Tooltip title="Settings">
                  <Button
                  variant="text"
                  size="small"
                  onClick={(event) => {
                      if (settingsMenuElement) {
                        closeSettings()
                      } else {
                        setSettingsMenuElement(event.currentTarget)
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
                    onClick={() => {
                        setTerminalVisibility(true)
                        closeSettings()
                    }}
                    className="hover:text-green-500"
                  >
                    <div className="text-sm">
                      <span className="mr-2 text-xs">
                          <FontAwesomeIcon
                            icon={faTerminal}
                          />
                      </span>
                      Terminal
                    </div>
                  </MenuItem>

                  <MenuItem 
                    onClick={() => {
                        console.log("bookmark", pwaInstallPrompt)
                    }}
                    className="hover:text-green-500"
                  >
                    <div className="text-sm">
                      <span className="mr-2 text-xs">
                          <FontAwesomeIcon
                            icon={faLink}
                          />
                      </span>
                      Create Desktop Link
                    </div>
                  </MenuItem>

                  <MenuItem 
                    className="hover:text-yellow-500"
                    onClick={async () => {
                        if (!(await confirm({title: "Are you sure you want to uninstall all files?", confirmButtonColor: "error"}))) {
                          return
                        }
                        setLauncherState("loading")
                        const message = "Uninstalling..."
                        document.title = message
                        setProgressMsg(message)
                        closeSettings()
                        localStorage.clear()
                        sessionStorage.clear()
                        await Promise.all([
                          import("../lib/database/AppDatabase").then((mod) => new mod.AppDatabase().clear()),
                          downloadClient.uninstallAllAssets(),
                        ])
                        window.setTimeout(() => {
                          location.reload()
                        }, 100)
                        
                    }}
                  >
                    <div className="text-sm w-full">
                      <span className="mr-2 text-xs">
                          <FontAwesomeIcon
                            icon={faFolderMinus}
                          />
                      </span>
                      Uninstall
                    </div>
                  </MenuItem>
              </Menu>
            </div>

            {!allFeaturesSupported ? <>
              <UnsupportedFeatures/>
            </> : <>
                <div>
                  <Button
                      variant="contained"
                      onClick={gatherAssets}
                      disabled={launcherState === "loading"}
                  >
                      {launcherState === "loading" 
                        ? <span className="text-lg animate-spin">
                            <LoadingIcon/>
                          </span>  
                        : startButtonText}
                  </Button>
                </div>

                <Collapse in={downloadError.length > 0}>
                    <div className="text-yellow-500 mt-4 text-sm">
                      {downloadError}
                    </div>
                </Collapse>

                <Collapse in={launcherState === "loading" && progressMsg.length > 0}>
                  <div className="mt-4 w-4/5 mx-auto text-sm">
                    {progressMsg}
                  </div>
                </Collapse>
            </>}
            
            

           <Tooltip
            placement="top"
            title={
              currentAppVersion === Shabah.NO_PREVIOUS_INSTALLATION 
                ? "Not installed yet"
                : "Launcher Version"
            }
           >
              <div className="fixed z-10 text-xs bottom-0 left-0 text-neutral-500 rounded">
                <button className={`hover:bg-neutral-900 p-2 ${launcherState === "loading" ? "animate-pulse" : ""}`}>
                  <span className={`mr-1.5 ${launcherState === "error" ? "text-yellow-400" : "text-blue-400"}`}>
                      <FontAwesomeIcon 
                        icon={faCodeBranch}
                      />
                  </span>
                  {currentAppVersion === Shabah.NO_PREVIOUS_INSTALLATION 
                    ? "not installed" 
                    : "v" + currentAppVersion
                  }
                </button>
              </div>
            </Tooltip>
        </div>
    </div>
  )
}

export default LauncherRoot
