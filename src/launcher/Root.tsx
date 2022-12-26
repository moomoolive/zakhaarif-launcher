import { useState, useEffect, ReactNode } from 'react'
import {
  Button, 
  Menu,
  MenuItem,
  Tooltip,
  Collapse,
} from "@mui/material"
import SettingsIcon from "@mui/icons-material/Settings"
import LoadingIcon from "@mui/icons-material/Loop"
import VersionIcon from "@mui/icons-material/Source"
import TerminalIcon from "@mui/icons-material/Terminal"
import {useStoreContext} from "../store"
import {isIframe} from "../lib/checks/index"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
  faTimes, faCheck, faBox
} from "@fortawesome/free-solid-svg-icons"
import {faChrome} from "@fortawesome/free-brands-svg-icons"
import type {OutboundMessage as ServiceWorkerMessage} from "../../serviceWorkers/types"
import {Shabah, roundDecimal, bytes} from "../../shabah/wrapper"
import {APP_CACHE} from "../../consts"

const enum log {
  name = "[🚀 launcher]:"
}

const sleep = (milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds))

const featureCheck = () => {
  if (isIframe()) {
    const supported = false
    return [
      {name: "service-worker", supported},
      {name: "background-fetch", supported},
      {name: "storage-estimate", supported},
      {name: "shared-array-buffer", supported},
      {name: "multiple-cores", supported},
      {name: "all-supported", supported},
    ] as const
  }
  const sw = ('serviceWorker' in navigator)
  const bgfetch = ("BackgroundFetchManager" in self)
  const storageQuery = typeof navigator?.storage?.estimate !== "undefined"
  const sharedBuffer = typeof SharedArrayBuffer !== "undefined"
  const multipleCpuCores = navigator.hardwareConcurrency > 1
  return [
    {name: "service-worker", supported: sw},
    {name: "background-fetch", supported: bgfetch},
    {name: "storage-estimate", supported: storageQuery},
    {name: "shared-array-buffer", supported: sharedBuffer},
    {name: "multiple-cores", supported: multipleCpuCores},
    {name: "all-supported", supported: sw && bgfetch && sharedBuffer && storageQuery && multipleCpuCores}
  ] as const
}

const UnsupportedFeatures = ({features}: {
  features: {name: string, supported: boolean}[]
}) => {
  const [showFeatureDetails, setShowFeatureDetails] = useState(false)

  return <>
    <div className="text-sm text-yellow-500 mb-3 mt-6">
      {"Your browser doesn't support all required features."}<br/>
      {"Try using the latest version of Chrome"}
      <span className="ml-2">
        <FontAwesomeIcon 
          icon={faChrome}
        />
      </span>
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
          {features.map((f, i) => {
            return <div
              key={`feature-check-${i}`}
              className="text-sm mb-1"
            >
              <span className="mr-2">
                {f.name}
              </span>
              {f.supported ? <span 
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
            </div>
          })}
      </div>
    </Collapse>
  </>
}

const appPackageId = "std-pkg"

import {
  webFetch, 
  webCacheFileCache,
  webBackgroundFetchDownloadManager
} from "../../shabah/webAdaptors"

const toGigabytes = (number: number) => {
  const decimal = number / bytes.bytes_per_gb
  const rounded = roundDecimal(decimal, 1)
  return Math.max(rounded, 0.1)
}

const toPercent = (fraction: number, decimals: number) => {
  return roundDecimal(fraction * 100, decimals)
}

const progressIndicator = (downloaded: number, total: number) => {
  return <div>
    <div>Updating App...</div>
      <div className="mt-1.5 flex items-center justify-center text-xs text-gray-400">
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

const APP_TITLE = "Game Launcher"

export const LauncherRoot = ({id}: {id: string}) => {
  const {launchApp, setTerminalVisibility} = useStoreContext()

  const [showProgress, setShowProgress] = useState(false)
  const [progressMsg, setProgressMsg] = useState<ReactNode>("")
  const [settingsMenuElement, setSettingsMenuElement] = useState<null | HTMLElement>(null)
  const [supportedFeatures] = useState(featureCheck())
  const [downloadClient] = useState(new Shabah({
    fetchFile: webFetch(),
    fileCache: webCacheFileCache(APP_CACHE),
    downloadManager: webBackgroundFetchDownloadManager(),
    origin: location.origin
  }))
  const [downloadError, setDownloadError] = useState("")
  const [buttonElement, setButtonElement] = useState(<>
    {"start"}
  </>)
  const [
    afterUpdateCheckAction, 
    setAfterUpdateCheckAction
  ] = useState<null | Function>(null)
  const [checkedForUpdates, setCheckedForUpdates] = useState(false)
  const [appUpdateInProgress, setAppUpdateInProgress] = useState(false)
  const [nextUpdateVersion, setNextUpdateVersion] = useState("none")
  const [
    currentAppVersion, 
    setCurrentAppVersion
  ] = useState(Shabah.NO_PREVIOUS_INSTALLATION)
  const allFeaturesSupported = supportedFeatures[5].supported

  const closeSettings = () => setSettingsMenuElement(null)

  const addProgressListener = () => {
    downloadClient.addProgressListener(appPackageId, async (progress) => {
      const {finished, installing, total, downloaded, failed} = progress
      if (finished) {
        setProgressMsg("Installing...")
        document.title = "Installing..."
        await sleep(2_000)
        document.title = APP_TITLE
        launchApp()
      } else if (installing) {
        setProgressMsg("Installing...")
        document.title = "Installing..."
      } else if (!failed) {
        const percent = toPercent(downloaded / total, 1)
        console.log("p", percent)
        document.title = `(${percent}%) Updating...`
        setProgressMsg(progressIndicator(downloaded, total))
      }
    })
  }

  const gatherAssets = async () => {
    if (isIframe()) {
      return
    }
    if (checkedForUpdates && afterUpdateCheckAction) {
      return afterUpdateCheckAction()
    }
    setDownloadError("")
    setShowProgress(true)
    setButtonElement(
      <span className='animate-spin'>
        <LoadingIcon/>
      </span>
    )
    setProgressMsg("Checking for Updates...")
    const root = location.origin + "/"
    const res = await downloadClient.checkForCargoUpdates({
      requestUrl: root,
      storageUrl: root,
      name: "std",
      id: appPackageId
    })
    await sleep(500)
    
    const previousVersionExists = res.updateCheckResponse.previousVersionExists
    
    setCheckedForUpdates(true)
    if (previousVersionExists && !res.enoughSpaceForPackage) {
      const updateVersion = res.versions.new
      setDownloadError(`Not enough disk space for update v${updateVersion} (${res.diskInfo.bytesNeededToDownloadFriendly} required)`)
      setButtonElement(<>{"Start Anyway"}</>)
      setAfterUpdateCheckAction(() => launchApp)
      setShowProgress(false)
      return
    } else if (previousVersionExists && res.errorOccurred) {
      setDownloadError(`Error occured when checking for updates`)
      setButtonElement(<>{"Start Anyway"}</>)
      setAfterUpdateCheckAction(() => launchApp)
      setShowProgress(false)
      return
    } else if (
      (!previousVersionExists && res.errorOccurred)
      || (!previousVersionExists && !res.enoughSpaceForPackage)
    ) {
      if (!res.enoughSpaceForPackage) {
        setDownloadError(`Not enough disk space install (${res.diskInfo.bytesNeededToDownloadFriendly} required)`)
      } else {
        setDownloadError("Couldn't contact update server")
      }
      setAfterUpdateCheckAction(null)
      setButtonElement(<>{"Retry"}</>)
      setShowProgress(false)
      return
    }

    if (!res.updateAvailable) {
      launchApp()
      return
    }
    setProgressMsg(`Update Found! Queuing...`)
    const updateQueueRes = await downloadClient.executeUpdates(
      res,
      `core v${res.versions.new}`,
    )
    
    if (updateQueueRes.data.code !== Shabah.statuses.updateQueued) {
      await sleep(2_000)
      setShowProgress(false)
      setDownloadError("Couldn't Queue Update")
      setButtonElement(<>{"Retry"}</>)
      return
    }
    await sleep(1_000)
    setProgressMsg("Updating...")
    document.title = "Updating..."
    setAppUpdateInProgress(true)
    setCurrentAppVersion(res.versions.old)
    setNextUpdateVersion(res.versions.new)
    addProgressListener()
  }

  useEffect(() => {
    if (isIframe() || !allFeaturesSupported) {
      return
    }
    const swUrl = import.meta.env.DEV
      ? "dev-sw.js"
      : "sw.js"
    navigator.serviceWorker.register(swUrl)
    const prefix = "[👷 service-worker]: "
    navigator.serviceWorker.onmessage = (msg) => {
      const {type, contents} = msg.data as ServiceWorkerMessage
      const contentsWithPrefix = prefix + contents
      switch (type) {
        case "error":
          console.error(contentsWithPrefix)
          break
        case "info":
          console.info(contentsWithPrefix)
          break
        default:
          console.warn("recieved message from service worker that is encoded incorrectly", msg.data)
      }
    }
  }, [])

  useEffect(() => {
    (async () => {
      const currentAppPkg = await downloadClient.getCargoMeta(appPackageId)
      if (!currentAppPkg || currentAppPkg.state === "deleted") {
        return
      }
      const {state} = currentAppPkg
      if (state === "cached") {
        return setCurrentAppVersion(currentAppPkg.version)
      }
      const updateInfo = await downloadClient.getDownloadState(appPackageId)
      if (!updateInfo) {
        return
      }
      const {previousVersion, version} = updateInfo
      setCurrentAppVersion(previousVersion)
      setButtonElement(
        <span className='animate-spin'>
          <LoadingIcon/>
        </span>
      )
      setAppUpdateInProgress(true)
      setShowProgress(true)
      setProgressMsg(`Updating...`)
      document.title = "Updating..."
      setNextUpdateVersion(version)
      addProgressListener()
    })()
    return downloadClient.removeProgressListener(appPackageId)
  }, [])

  return (
    <div 
      id={id}
      className="relative text-center z-0 w-screen h-screen flex justify-center items-center"
    >
        <div className="relative z-0">
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
                    setTerminalVisibility(true)
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

            <div className="flex w-screen items-center flex-wrap justify-center">
              <div>
                  <Button
                      variant="contained"
                      onClick={gatherAssets}
                      disabled={
                        !allFeaturesSupported 
                        || showProgress
                        || appUpdateInProgress
                      }
                  >
                      {buttonElement}
                  </Button>
              </div>
            </div>

            {!allFeaturesSupported ? <>
              <UnsupportedFeatures 
                features={supportedFeatures.slice(0, -1)}
              />
            </> : <></>}
            
            <Collapse in={showProgress}>
                <div className="mt-4 w-4/5 mx-auto text-sm">
                  {progressMsg}
                </div>
            </Collapse>

            <Collapse in={downloadError.length > 0}>
                <div className="text-yellow-500 mt-4 text-sm">
                  {downloadError}
                </div>
            </Collapse>

            <div className="fixed z-10 text-xs bottom-2 left-2 text-gray-500">
              <span className="mr-2 text-blue-400">
                  <VersionIcon/>
              </span>
              {currentAppVersion}
              {appUpdateInProgress ? <>
                <span className="ml-1 text-blue-500">
                  {"=>"}
                </span>
                <span className="ml-1 text-green-700 animate-pulse">
                  {nextUpdateVersion}
                </span> 
              </> : <></>}
            </div>
            
        </div>
    </div>
  )
}
