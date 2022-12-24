import { useState, useEffect } from 'react'
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
import {faTimes, faCheck} from "@fortawesome/free-solid-svg-icons"
import {faChrome} from "@fortawesome/free-brands-svg-icons"
import type {OutboundMessage as ServiceWorkerMessage} from "../../serviceWorkers/types"
import {Shabah} from "../../shabah/wrapper"
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

let serviceWorkerRegistered = false

const appPackageId = "std-pkg"

import {
  webFetch, 
  webCacheFileCache,
  webBackgroundFetchDownloadManager
} from "../../shabah/webAdaptors"

export const Root = ({id}: {id: string}) => {
  const {
    launchApp,
    setTerminalVisibility
  } = useStoreContext()

  const [showProgress, setShowProgress] = useState(false)
  const [progressMsg, setProgressMsg] = useState("")
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
    
    console.log(res)
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
      `game core v${res.versions.new}`,
      {removeExpiredFiles: true}
    )
    console.log("update queue res", updateQueueRes)
    await sleep(3_000)
    setProgressMsg("Updating App...")
    setAppUpdateInProgress(true)
    setNextUpdateVersion(res.versions.new)
  }

  useEffect(() => {
    if (isIframe() || serviceWorkerRegistered) {
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
    serviceWorkerRegistered = true
  }, [])

  useEffect(() => {
    (async () => {
      const [currentAppPkg, updateInfo] = await Promise.all([
        downloadClient.getCargoMeta(appPackageId),
        downloadClient.updateState(appPackageId)
      ] as const)
      const {updating, updateVersion, previousVersion} = updateInfo
      if (!updating) {
        setCurrentAppVersion(
          currentAppPkg?.version
          || Shabah.NO_PREVIOUS_INSTALLATION
        )
        return
      }
      setCurrentAppVersion(previousVersion)
      setAppUpdateInProgress(true)
      setShowProgress(true)
      setProgressMsg(`Updating App...`)
      setNextUpdateVersion(updateVersion)
    })()
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

            <div className="flex items-center flex-wrap justify-center">
              <div>
                {appUpdateInProgress ? <>
                  <Button
                    variant="contained"
                    onClick={gatherAssets}
                    disabled={true}
                  >
                    <span className='animate-spin'>
                      <LoadingIcon/>
                    </span>
                </Button>
                </> : <>
                  <Button
                      variant="contained"
                      onClick={gatherAssets}
                      disabled={
                        !allFeaturesSupported 
                        || showProgress
                      }
                  >
                      {buttonElement}
                  </Button>
                </>}
                
              </div>
            </div>

            {!allFeaturesSupported ? <>
              <UnsupportedFeatures 
                features={supportedFeatures.slice(0, -1)}
              />
            </> : <></>}
            
            <Collapse in={showProgress}>
                <div className="mt-4 text-sm">
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
