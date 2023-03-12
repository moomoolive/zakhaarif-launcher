import {useState, useEffect, useRef} from "react"
import {
	Button, 
	Menu,
	MenuItem,
	Tooltip,
	Collapse,
} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
	faTimes, 
	faCheck, 
	faCodeBranch,
	faTerminal, 
	faFolderMinus,
	faGear,
	faCube,
} from "@fortawesome/free-solid-svg-icons"
import {Shabah} from "../lib/shabah/downloadClient"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {STANDARD_CARGOS} from "../standardCargos"
import {useAppContext} from "./store"
import {useNavigate} from "react-router-dom"
import {APP_LAUNCHED, ASKED_TO_PERSIST} from "../lib/utils/localStorageKeys"
import {useEffectAsync} from "../hooks/effectAsync"
import LoadingIcon from "../components/LoadingIcon"
import {UpdateCheckResponse} from "../lib/shabah/updateCheckStatus"
import {sleep} from "../lib/utils/sleep"
import {ABORTED, FAILED, UPDATING} from "../lib/shabah/backend"
import {BYTES_PER_GB} from "../lib/utils/consts/storage"
import {roundDecimal} from "../lib/math/rounding"

const toGigabytes = (bytes: number, minimum: number): number => {
	const rawGigabytes = bytes / BYTES_PER_GB
	const rounded = roundDecimal(rawGigabytes, 2)
	const minimumOrGreater = Math.max(rounded, minimum)
	return minimumOrGreater
}

const UnsupportedFeatures = (): JSX.Element => {
	const {browserFeatures} = useAppContext()

	const [showFeatureDetails, setShowFeatureDetails] = useState(false)

	const {current: insufficentHardware} = useRef(browserFeatures.some(
		(feature) => feature.hardwareRelated && !feature.supported)
	)
	const {current: insufficentSoftware} = useRef(browserFeatures.some(
		(feature) => !feature.hardwareRelated && !feature.supported)
	)
	const {current: requirementText} = useRef((() => {
		if (insufficentHardware && insufficentSoftware) {
			return "device & browser"
		} else if (insufficentHardware) {
			return "device"
		} else if (insufficentSoftware) {
			return "browser"
		} else {
			return ""
		}
	})())

  

	return <>
		<div className="text-sm text-yellow-500 mb-3 mt-6">
			{`Your ${requirementText} ${insufficentSoftware && insufficentHardware ? "don't" : "doesn't"} support all required features.`}<br/>
			{insufficentSoftware ? <>
				{"Try using the latest version of Chrome, Firefox, or Safari"}
			</> : ""}
		</div>

		<div>
			<Button 
				size="small"
				color="info"
				onClick={() => setShowFeatureDetails((current) => !current)}
			>
				{showFeatureDetails ? "Hide" : "Details"}
			</Button>
		</div>

		<Collapse in={showFeatureDetails}>
			<div className="max-w-sm mx-auto text-left">
				{browserFeatures.filter(({supported}) => !supported).map((feature, i) => {
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

const APP_TITLE = import.meta.env.VITE_APP_TITLE

type LauncherState = (
  "uninstalled"
  | "cached"
  | "error"
  | "loading"
  | "ignorable-error"
)

const NO_DOWNLOAD_LISTENER = "none"

const LauncherRoot = (): JSX.Element => {
	const confirm = useGlobalConfirm()
	const app = useAppContext()
	const {setTerminalVisibility, downloadClient, logger} = app
	const navigate = useNavigate()

	const [progressMsg, setProgressMsg] = useState("")
	const [settingsMenuElement, setSettingsMenuElement] = useState<null | HTMLElement>(null)
	const [downloadError, setDownloadError] = useState("")
	const [currentAppVersion, setCurrentAppVersion] = useState(Shabah.NO_PREVIOUS_INSTALLATION)
	const [launcherState, setLauncherState] = useState<LauncherState>("uninstalled")
	const [startButtonText, setStartButtonText] = useState("Install") 
	const [downloadMetadata, setDownloadMetadata] = useState({
		downloaded: 0, total: 0
	})

	const updatingCorePackages = useRef<string[]>([])
	const {current: launchApp} = useRef(() => {
		sessionStorage.setItem(APP_LAUNCHED, "1")
		navigate("/launch")
	})
	const {current: allFeaturesSupported} = useRef(
		app.browserFeatures.every((feature) => feature.supported)
	)
	const downloadListenerRef = useRef(-1)
	const downloadId = useRef(NO_DOWNLOAD_LISTENER)
	const {current: createDownloadListener} = useRef(() => {
		const milliseconds = 1_000
		downloadListenerRef.current = window.setInterval(async () => {
			if (downloadId.current === NO_DOWNLOAD_LISTENER) {
				return
			}
			const state = await downloadClient.getDownloadStateById(downloadId.current)
			if (!state) {
				return
			}
			setDownloadMetadata({downloaded: state.downloaded, total: state.total})
		}, milliseconds)
	})
	const {current: closeSettings} = useRef(() => setSettingsMenuElement(null))

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
			"game core retry",
			{
				backgroundDownload: false,
				allowAssetCache: import.meta.env.VITE_APP_ALLOW_ASSET_CACHE === "true"
			}
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
		if (
			import.meta.env.PROD 
      && !!sessionStorage.getItem(APP_LAUNCHED)
		) {
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
    
		logger.info(
			"launcher update response", launcher,
			"game-extension update response", gameExtension,
			"std-mod update response", standardMod
		)

		const updatesAvailable = updates.filter((update) => update.updateAvailable())
		const errors = updates.filter((update) => update.errorOccurred())
    
		const enoughStorage = UpdateCheckResponse.enoughStorageForAllUpdates(updatesAvailable)
		const previousVersionsExist = updates.every((update) => update.previousVersionExists())
		const errorOccurred = errors.length > 0
		const updateAvailable = updatesAvailable.length > 0

		logger.info(
			"updates_available =", updateAvailable,
			"error_occurred =", errorOccurred,
			"installation_exists =", previousVersionsExist,
			"enough_space =", enoughStorage
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
		setProgressMsg("Update Found! Updating...")
		document.title = "Updating..."
		updatingCorePackages.current = updatesAvailable.map(
			(update) => update.canonicalUrl
		)
		const queueResponse = await downloadClient.executeUpdates(
			updatesAvailable,
			"game core",
			{
				backgroundDownload: false,
				allowAssetCache: import.meta.env.VITE_APP_ALLOW_ASSET_CACHE === "true"
			}
		)

		logger.info("queue response", queueResponse)

		if (queueResponse.data === Shabah.STATUS.noDownloadbleResources) {
			setProgressMsg("Installing...")
			await sleep(1_500)
			launchApp()
			return
		}

		const updateQueued = (
			queueResponse.data === Shabah.STATUS.updateQueued
      || queueResponse.data === Shabah.STATUS.ok
      || queueResponse.data === Shabah.STATUS.assetCacheDisallowed
		)
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
    
		const [firstSegment] = updatesAvailable
		const downloadState = await downloadClient.getDownloadState(firstSegment.canonicalUrl)
		if (downloadState) {
			downloadId.current = downloadState.id
			createDownloadListener()
		}

		setProgressMsg("Installing...")
		await sleep(1_500)
		launchApp()

		if (
			import.meta.env.PROD
      && !window.localStorage.getItem(ASKED_TO_PERSIST)
		) {
			await downloadClient.askToPersist()
			window.localStorage.setItem(ASKED_TO_PERSIST, "true")
			return
		}
	}

	useEffect(() => {
		const handerId = app.addEventListener("downloadprogress", async (progress) => {
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
				setDownloadMetadata((previous) => {
					return {downloaded: previous.total, total: previous.total}
				})
				await sleep(2_000)
				setDownloadMetadata({downloaded: 0, total: 0})
				return
			}

			await downloadClient.consumeQueuedMessages()
			await sleep(4_000)
      
			if (type === "abort" || type === "fail") {
				setLauncherState("error")
				return
			}

			launchApp()     
		})

		return () => {
			document.title = APP_TITLE
			app.removeEventListener("downloadprogress", handerId)
			window.clearInterval(downloadListenerRef.current)
		}
	}, [])

	useEffectAsync(async () => {
		await downloadClient.consumeQueuedMessages()

		const statuses = await Promise.all([
			downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[0].canonicalUrl),
			downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[1].canonicalUrl),
			downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[2].canonicalUrl),
		] as const)
		const [launcherStatus, gameStatus, modStatus] = statuses
    
		const notInstalled = statuses.some((cargo) => !cargo)
		const isUpdating = statuses.some((cargo) => cargo?.state === UPDATING)
		const errorOccurred = statuses.some(
			(cargo) => cargo?.state === ABORTED || cargo?.state === FAILED
		)

		logger.info(
			"standard cargo statuses:",
			"not_installed =", notInstalled,
			"error =", errorOccurred,
			"updating =", isUpdating
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
			const validUrls = statuses.map((cargo) => cargo?.canonicalUrl || "")
			updatingCorePackages.current = validUrls.filter((url) => url.length > 0)
			const targetDownloadId = (
				launcherStatus.downloadId
        || gameStatus?.downloadId
        || modStatus?.downloadId
        || NO_DOWNLOAD_LISTENER
			)
			downloadId.current = targetDownloadId
			createDownloadListener()
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
							<span className="text-lg">
								<FontAwesomeIcon icon={faGear}/>
							</span>
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
									app.database.clear(),
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

						<Collapse 
							in={
								launcherState === "loading" 
                      && downloadMetadata.total > 0
							}
						>
							<div className="mt-4 text-sm">
								<span className="mr-2 text-blue-500">
									<FontAwesomeIcon icon={faCube}/>
								</span>

								<span>
									{`${toGigabytes(downloadMetadata.downloaded, downloadMetadata.downloaded === downloadMetadata.total ? 0.01 : 0.0).toFixed(2)} GB`}
								</span>
                        
								<span className="text-neutral-400">
									{`/${toGigabytes(downloadMetadata.total, 0.01).toFixed(2)} GB`}
								</span>
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
						<div className={`hover:bg-neutral-900 p-2 ${launcherState === "loading" ? "animate-pulse" : ""}`}>
							<span className={`mr-1.5 ${launcherState === "error" ? "text-yellow-400" : "text-blue-400"}`}>
								<FontAwesomeIcon 
									icon={faCodeBranch}
								/>
							</span>
							{currentAppVersion === Shabah.NO_PREVIOUS_INSTALLATION 
								? "not installed" 
								: "v" + currentAppVersion
							}
						</div>
					</div>
				</Tooltip>
			</div>
		</div>
	)
}

export default LauncherRoot
