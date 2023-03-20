import {Tooltip, Menu, MenuItem, Skeleton} from "@mui/material"
import {ReactNode, useEffect, useRef, useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
	faCaretDown, 
	faTrash,
	faAngleRight,
	faInfoCircle,
	faRotate,
	faPlay,
	faShieldDog,
	faDownload,
	faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons"
import {useAppContext} from "../../routes/store"
import {useGlobalConfirm} from "../../hooks/globalConfirm"
import {isExtension, isInErrorState, isStandardCargo} from "../../lib/utils/cargos"
import type {CargoDirectory, RootDirectoryPath} from "./CargoFileSystem"
import type {ManifestIndex} from "../../lib/shabah/downloadClient"
import {CargoIcon} from "./Icon"
import {NULL_FIELD as CARGO_NULL_FIELD} from "huzma"
import {useNavigate} from "react-router-dom"
import {EXTENSION_SHELL_TARGET} from "../../lib/utils/searchParameterKeys"
import {UPDATING} from "../../lib/shabah/backend"
import {nanoid} from "nanoid"
import {LAUNCHER_CARGO} from "../../standardCargos"

const ROOT_DIRECTORY_PATH: RootDirectoryPath = "~"

type FileSystemBreadcrumbsProps = {
    isViewingCargo: boolean
    cargoFound: boolean
    directoryPath: CargoDirectory[]
    targetCargo: ManifestIndex | null
    onBackToCargos: () => unknown
    mutateDirectoryPath: (newValue: CargoDirectory[]) => unknown
    onShowCargoInfo: () => unknown
    onShowCargoUpdater: () => unknown
    onDeleteCargo: (canonicalUrl: string) => Promise<boolean>
    onRecoverCargo: (canonicalUrl: string) => unknown
    onCreateAlert: (type: "success" | "error", content: ReactNode) => unknown
    onGetSearchResultUrls: () => string[]
}

export const FileSystemBreadcrumbs = ({
	isViewingCargo,
	cargoFound,
	directoryPath,
	targetCargo,
	mutateDirectoryPath,
	onBackToCargos,
	onShowCargoInfo,
	onShowCargoUpdater,
	onDeleteCargo,
	onRecoverCargo,
	onCreateAlert,
	onGetSearchResultUrls
}: FileSystemBreadcrumbsProps): JSX.Element => {
	const {downloadClient, logger, database} = useAppContext()
	const confirm = useGlobalConfirm()
	const navigate = useNavigate()

	const [cargoMenuElement, setCargoMenuElement] = useState<HTMLElement | null>(null)
	const [loadingCargo, setLoadingCargo] = useState(true)

	const timerIdRef = useRef(-1)
	const {current: downloadCanonicalUrls} = useRef((
		filePrefix: string,
		urls: string[]
	) => {
		logger.info(`found ${urls.length} canonical urls. Creating data url...`)
		const encodedJson = encodeURIComponent(JSON.stringify(urls))
		const downloadLink = document.createElement("a")
		downloadLink.download = `${filePrefix}.${nanoid(6)}.json`
		downloadLink.href = "data:text/json;charset=utf-8," +  encodedJson
		downloadLink.click()
	})

	useEffect(() => {
		if (!isViewingCargo) {
			setLoadingCargo(false)
			return () => window.clearTimeout(timerIdRef.current)
		}
		setLoadingCargo(true)
		timerIdRef.current = window.setTimeout(() => {
			setLoadingCargo(false)
		}, 600)
		return () => window.clearTimeout(timerIdRef.current)
	}, [isViewingCargo])


	return <div 
		className=" text-sm text-neutral-300 p-3 flex items-center flex-wrap"
	>
		<div>
			{isViewingCargo ? <>
				<Tooltip title="My Add-ons">
					<button
						className="hover:bg-gray-900 p-1 px-2 rounded text-neutral-400 animate-fade-in-left"
						onClick={() => {
							if (isViewingCargo) {
								onBackToCargos()
							}
						}}
					>
						{"My Add-ons"}
					</button>
				</Tooltip>
			</> : <>
				<button
					className="hover:bg-gray-900 p-1 px-2 rounded"
					onClick={(event) => setCargoMenuElement(event.currentTarget)}
				>
					{"My Add-ons"}
					<span className="ml-2">
						<FontAwesomeIcon icon={faCaretDown}/>
					</span>
				</button>

				<Menu
					anchorEl={cargoMenuElement}
					open={!!cargoMenuElement}
					onClose={() => setCargoMenuElement(null)}
				>
					<MenuItem
						className="hover:text-green-500"
						onClick={async () => {
							if (!await confirm({title: "Are you sure you want to export all add-ons to JSON?", confirmButtonColor: "success"})) {
								return
							}
							const canonicalUrls = await database.cargoIndexes.getAllCanonicalUrls()
							setCargoMenuElement(null)
							downloadCanonicalUrls("add-ons", canonicalUrls)
							onCreateAlert("success", "Exported add-ons")
						}}
					>
						<span className="mr-3">
							<FontAwesomeIcon icon={faDownload}/>
						</span>

						{"Export add-ons to JSON"}
					</MenuItem>

					<MenuItem
						className="hover:text-green-500"
						onClick={async () => {
							if (!await confirm({title: "Are you sure you want to export search results to JSON?", confirmButtonColor: "success"})) {
								return
							}
							const canonicalUrls = onGetSearchResultUrls()
							setCargoMenuElement(null)
							downloadCanonicalUrls("add-ons", canonicalUrls)
							onCreateAlert("success", "Exported add-ons")
						}}
					>
						<span className="mr-3">
							<FontAwesomeIcon icon={faMagnifyingGlass}/>
						</span>

						{"Search results to JSON"}
					</MenuItem>

					<MenuItem
						className="hover:text-red-500"
						onClick={async () => {
							if (!await confirm({title: "Are you sure you want to uninstall this app?", confirmButtonColor: "error"})) {
								return
							}
							await downloadClient.uninstallAllAssets()
							location.replace("/")
						}}
					>
						<span className="mr-3">
							<FontAwesomeIcon icon={faTrash}/>
						</span>
                        Uninstall App
					</MenuItem>
				</Menu>
			</>}
		</div>

		{isViewingCargo && loadingCargo ? <div>
			<span className="mx-1">
				<FontAwesomeIcon icon={faAngleRight}/>
			</span>
			<button
				className="hover:bg-gray-900 p-1 px-2 w-10 rounded animate-fade-in-left"
			>
				<Skeleton animation="wave"/>
			</button>
		</div> : <></>}
        
		{isViewingCargo && !cargoFound && !loadingCargo ? <div>
			<span className="mx-1">
				<FontAwesomeIcon icon={faAngleRight}/>
			</span>
			<button
				className="hover:bg-gray-900 p-1 px-2 rounded text-yellow-500 animate-fade-in-left"
			>
				{"Not found"}
			</button>
		</div> : <></>}

		{isViewingCargo && cargoFound && targetCargo && !loadingCargo ? <>
			{directoryPath.map((pathSection, index) => {
				const {path} = pathSection
				return <div
					key={`path-section-${index}`}
					className="flex items-center"
				>
					<div>
						<span className="mx-1">
							<FontAwesomeIcon 
								icon={faAngleRight}
							/>
						</span>
					</div>

					<div>
						<button
							className="hover:bg-gray-900 py-1 px-2 rounded"
							onClick={(event) => {
								if (index < directoryPath.length - 1) {
									mutateDirectoryPath(directoryPath.slice(0, index + 1))
									return
								} else {
									setCargoMenuElement(event.currentTarget)
								}
							}}
						>
							<div className="flex items-center">
								{path === ROOT_DIRECTORY_PATH && targetCargo.logo !== CARGO_NULL_FIELD ? <div
									className="mr-1"
								>
									<CargoIcon 
										importUrl={targetCargo.resolvedUrl}
										logoUrl={targetCargo.logo}
										pixels={17}
										className="animate-fade-in-left"
									/>
								</div> : <></>}
								<div>
									{path === ROOT_DIRECTORY_PATH 
										? targetCargo.name
										: path
									}
									{index === directoryPath.length - 1 ? <>
										<span className="ml-2">
											<FontAwesomeIcon 
												icon={faCaretDown}
											/>
										</span>
									</> : <></>}
								</div>
							</div>
                            
						</button>
					</div>

					<Menu
						anchorEl={cargoMenuElement}
						open={!!cargoMenuElement}
						onClose={() => setCargoMenuElement(null)}
					>
						<MenuItem
							className="hover:text-green-500"
							onClick={() => {
								onShowCargoInfo()
								setCargoMenuElement(null)
							}}
						>
							<span className="mr-3">
								<FontAwesomeIcon icon={faInfoCircle}/>
							</span>
                            Info
						</MenuItem>

						<MenuItem
							className="hover:text-blue-500"
							disabled={targetCargo.state === UPDATING}
							onClick={() => {
								onShowCargoUpdater()
								setCargoMenuElement(null)
							}}
						>
							<span className="mr-2.5">
								<FontAwesomeIcon icon={faRotate} />
							</span>
                            Update
						</MenuItem>

						{isInErrorState(targetCargo) ? <MenuItem
							className="hover:text-indigo-500"
							onClick={() => {
								onRecoverCargo(targetCargo.canonicalUrl)
								setCargoMenuElement(null)
							}}
						>
							<span className="mr-2.5">
								<FontAwesomeIcon icon={faShieldDog} />
							</span>
                            Recover
						</MenuItem> : null}
                        
						{isExtension(targetCargo)
							? <MenuItem
								className="hover:text-yellow-500"
								onClick={async () => {
									const confirmed = await confirm({title: "Are you sure you want to run this add-on?", confirmButtonColor: "warning"})
									setCargoMenuElement(null)
									if (!confirmed) {
										return
									}
									if (targetCargo.canonicalUrl === LAUNCHER_CARGO.canonicalUrl) {
										navigate("/")
										return
									}
									navigate(`/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(targetCargo.canonicalUrl)}`)
								}}
							>
								<span className="ml-0.5 mr-3">
									<FontAwesomeIcon icon={faPlay}/>
								</span>
                                Run
							</MenuItem>
							: null
						}

						<MenuItem
							className="hover:text-red-500"
							disabled={targetCargo.canonicalUrl === LAUNCHER_CARGO.canonicalUrl}
							onClick={async () => {
								const target = targetCargo
								const isStandard = isStandardCargo(targetCargo)
								if (!await confirm({title: `Are you sure you want to delete this ${isStandard ? " core " : ""}add-on forever?`, confirmButtonColor: "error"})) {
									setCargoMenuElement(null)
									return
								}
								setCargoMenuElement(null)
								const response = await onDeleteCargo(target.canonicalUrl)
								if (response) {
									onCreateAlert("success", "Deleted Successfully")
									return
								}
								onCreateAlert("error", "Couldn't Delete")
							}}
						>
							<span className="mr-3">
								<FontAwesomeIcon icon={faTrash} />
							</span>
                            Delete
						</MenuItem>
					</Menu>
				</div>
			})}
		</> : <></>}
	</div>
}