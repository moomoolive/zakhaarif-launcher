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
  faTimes, faCheck, faCodeBranch,
  faLink, faTerminal, faFolderMinus
} from "@fortawesome/free-solid-svg-icons"
import {faChrome} from "@fortawesome/free-brands-svg-icons"
import {CargoState, Shabah} from "../lib/shabah/downloadClient"
import {featureCheck} from "../lib/utils/appFeatureCheck"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {STANDARD_CARGOS} from "../standardCargos"
import {useAppShellContext} from "./store"
import {useNavigate} from "react-router-dom"
import {APP_LAUNCHED} from "../lib/utils/localStorageKeys"
import { useEffectAsync } from '../hooks/effectAsync'
import LoadingIcon from '../components/LoadingIcon'
import { UpdateCheckResponse } from '../lib/shabah/updateCheckStatus'
import { sleep } from '../lib/utils/sleep'
import { ABORTED, CACHED, FAILED, UPDATING } from '../lib/shabah/backend'

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
          <FontAwesomeIcon icon={faChrome}/>
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

type PwaInstallPrompt = {
  prompt: () => void
  userChoice: () => Promise<"accepted" | "dismissed">
}

type PwaInstallEvent = Event & PwaInstallPrompt

const APP_TITLE = "Game Launcher"
let pwaInstallPrompt = null as null | PwaInstallEvent

const NO_LISTENER = -1

type LauncherState = (
  "uninstalled"
  | "cached"
  | "error"
  | "loading"
  | "ignorable-error"
)

const LauncherRoot = (): JSX.Element => {
  const confirm = useGlobalConfirm()
  const app = useAppShellContext()
  const {setTerminalVisibility, downloadClient} = app
  const navigate = useNavigate()

  const [progressMsg, setProgressMsg] = useState("")
  const [settingsMenuElement, setSettingsMenuElement] = useState<null | HTMLElement>(null)
  const [downloadError, setDownloadError] = useState("")
  const [currentAppVersion, setCurrentAppVersion] = useState(Shabah.NO_PREVIOUS_INSTALLATION)
  const [launcherState, setLauncherState] = useState<LauncherState>("uninstalled")
  const [startButtonText, setStartButtonText] = useState("Install") 

  const updatingCorePackages = useRef<string[]>([])
  const {current: launchApp} = useRef(() => {
    sessionStorage.setItem(APP_LAUNCHED, "1")
    navigate("/launch")
  })
  const updateListener = useRef(NO_LISTENER)
  const {current: allFeaturesSupported} = useRef(
    featureCheck().every((feature) => feature.supported)
  )

  const closeSettings = () => setSettingsMenuElement(null)

  const retryFailedDownloads = async (): Promise<void> => {
    const standardCargos = await Promise.all(STANDARD_CARGOS.map(
      (cargo) => downloadClient.getCargoIndexByCanonicalUrl(cargo.canonicalUrl)
    ))
    const errorPackages = standardCargos.filter((cargo) => (
      cargo?.state === ABORTED
      || cargo?.state === FAILED
    ))
    const urls = errorPackages
      .map((cargo) => cargo?.canonicalUrl || "")
      .filter((url) => url.length > 0)
    if (urls.length < 1) {
      launchApp()
      return
    }
    updatingCorePackages.current = urls
    const retryResponse = await downloadClient.retryFailedDownloads(
      urls,
      "game core retry"
    )
    setProgressMsg("Retrying...")
    if (retryResponse.data !== Shabah.STATUS.updateRetryQueued) {
      setLauncherState("error")
      setDownloadError("Retry failed")
    } else {
      setProgressMsg("Updating...")
      document.title = "Updating..."
    }
  }

  const gatherAssets = async (): Promise<void> => {
    if (import.meta.env.PROD && !!sessionStorage.getItem(APP_LAUNCHED)) {
      launchApp()
      return
    }
  
    setDownloadError("")
    setLauncherState("loading")
    if (launcherState === "error") {
      retryFailedDownloads()
      return
    }

    setProgressMsg("Checking for Updates...")
    const updateCheck = Promise.all([
      downloadClient.checkForUpdates(STANDARD_CARGOS[0]),
      downloadClient.checkForUpdates(STANDARD_CARGOS[1]),
      downloadClient.checkForUpdates(STANDARD_CARGOS[2]),
    ] as const)
    // update ui should take a least a second
    const [updates] = await Promise.all([updateCheck, sleep(1_000)] as const)
    const [launcher, gameExtension, standardMod] = updates 
    console.log(
      "launcher", launcher,
      "game-extension", gameExtension,
      "std-mod", standardMod
    )

    const updatesAvailable = updates.filter((update) => update.updateAvailable())
    const errors = updates.filter((update) => update.errorOccurred())
    
    const enoughStorage = UpdateCheckResponse.enoughStorageForAllUpdates(updatesAvailable)
    const previousVersionsExist = updates.every((update) => update.previousVersionExists())
    const errorOccurred = errors.length > 0
    const updateAvailable = updatesAvailable.length > 0

    console.log(
      "updates available", updateAvailable,
      "errors", errorOccurred,
      "previous exists", previousVersionsExist,
      "enough space", enoughStorage
    )

    if (errorOccurred && previousVersionsExist) {
      setLauncherState("ignorable-error")
      setDownloadError("Couldn't fetch update")
      return
    }

    if (errorOccurred && !previousVersionsExist) {
      setLauncherState("uninstalled")
      setDownloadError("Couldn't fetch files")
      return
    }

    if (!enoughStorage && previousVersionsExist) {
      setLauncherState("ignorable-error")
      setDownloadError("Not enough storage for update")
      return
    }

    if (!enoughStorage && !previousVersionsExist) {
      setLauncherState("uninstalled")
      setDownloadError("Not enough storage to install")
      return
    }
    
    if (!updateAvailable) {
      launchApp()
      return
    }

    await downloadClient.cacheRootDocumentFallback()
    setProgressMsg(`Update Found! Queuing...`)
    updatingCorePackages.current = updatesAvailable.map(
      (update) => update.canonicalUrl
    )
    const queueResponse = await downloadClient.executeUpdates(
      updatesAvailable,
      "game core",
    )

    console.log("queue response", queueResponse)

    if (queueResponse.data === Shabah.STATUS.noDownloadbleResources) {
      setProgressMsg("Installing...")
      window.setTimeout(launchApp, 3_000)
      return
    }

    const updateQueued = queueResponse.data === Shabah.STATUS.updateQueued
    if (!updateQueued && !previousVersionsExist) {
      setLauncherState("error")
      setDownloadError("Couldn't Queue Update")
      setStartButtonText("Retry")
      updatingCorePackages.current = []
      return
    }

    if (!updateQueued && previousVersionsExist) {
      setLauncherState("ignorable-error")
      setDownloadError("Couldn't Queue Update")
      setStartButtonText("Retry")
      return
    }

    setProgressMsg("Updating...")
    document.title = "Updating..."
    setCurrentAppVersion(launcher.versions().old)
  }

  useEffect(() => {
    updateListener.current = app.addEventListener("downloadprogress", async (progress) => {
      console.log("got progress", progress)
      const {type, canonicalUrls} = progress
      const packages = updatingCorePackages.current
      const relatedToCorePackages = canonicalUrls.some(
        (url) => packages.includes(url)
      )
      
      if (!relatedToCorePackages) {
        return
      }
      
      if (type === "install") {
        document.title = "Installing..."
        setProgressMsg("Installing...")
      }

      const cargoIndexes = await downloadClient.getCargoIndices()
      const targetIndexes = progress.canonicalUrls
        .map((url) => cargoIndexes.cargos.findIndex((cargo) => cargo.canonicalUrl === url))
        .filter((index) => index > -1)
      const {cargos} = cargoIndexes
      if (type === "success") {
        targetIndexes.forEach((index) => cargos.splice(index, 1, {...cargos[index], state: CACHED}))
        window.setTimeout(launchApp, 3_000)
      }
  
      if (type === "abort" || type === "fail") {
        const nextState: CargoState = type === "abort" ? ABORTED : FAILED 
        targetIndexes.forEach((index) => cargos.splice(index, 1, {
          ...cargos[index],
          state: nextState,
          downloadId: "",
        }))
        setLauncherState("error")
      }
    })

    return () => {
      document.title = APP_TITLE
      app.removeEventListener("downloadprogress", updateListener.current)
    }
  }, [])

  useEffectAsync(async () => {
    const statuses = await Promise.all([
      downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[0].canonicalUrl),
      downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[1].canonicalUrl),
      downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[2].canonicalUrl),
    ] as const)
    const [launcherStatus] = statuses

    console.log("statuses", statuses)
    
    const notInstalled = statuses.some((cargo) => !cargo)
    const isUpdating = statuses.some((cargo) => cargo?.state === UPDATING)
    const errorOccurred = statuses.some(
      (cargo) => cargo?.state === ABORTED || cargo?.state === FAILED
    )

    console.log(
      "from init",
      "not installed", notInstalled,
      "error", errorOccurred,
      "updating", isUpdating
    )

    if (!launcherStatus || notInstalled) {
      setStartButtonText("Install")
      setLauncherState("uninstalled")
      return
    }

    setCurrentAppVersion(launcherStatus.version)
    
    if (errorOccurred) {
      setDownloadError("Update Failed...")
      setLauncherState("error")
      setStartButtonText("Retry")
      return
    }


    if (isUpdating) {
      setLauncherState("loading")
      updatingCorePackages.current = statuses
        .map((cargo) => cargo?.canonicalUrl || "")
        .filter((url) => url.length > 0)
      return
    }

    // At this point we are sure
    // that none of the core packages
    // are in an error/loading/uninstalled
    // state. So assume that they are cached
    setLauncherState("cached")
    setStartButtonText("Start")
  }, [])

  return (
    <div 
      id="launcher-root"
      className="relative text-center z-0 w-screen h-screen flex justify-center items-center"
    >
        <div className="relative w-full z-0">
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
                          sleep(3_000)
                        ])
                        location.reload()
                    }}
                  >
                    <div className="text-sm w-full">
                      <span className="mr-2 text-xs">
                        <FontAwesomeIcon icon={faFolderMinus}/>
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
                        : startButtonText
                      }
                  </Button>
                  
                  <Collapse in={launcherState === "ignorable-error"}>
                    <div className="mt-4">
                      <Button
                        variant="contained"
                        color="warning"
                        onClick={launchApp}
                      >
                        {"Start"}
                      </Button>
                    </div>
                  </Collapse>
                </div>
                
                <div className="w-full">
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
                </div>
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
