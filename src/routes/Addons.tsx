import {useState, useMemo, useRef, useEffect, ReactNode} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FullScreenLoadingOverlay} from "../components/LoadingOverlay"
import {ErrorOverlay} from "../components/ErrorOverlay"
import {
    Button, 
    Tooltip,
    Fab,
    TextField,
    InputAdornment,
    Divider,
    IconButton
} from "@mui/material"
import {Link, useNavigate} from "react-router-dom"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faPuzzlePiece, 
    faHardDrive,
    faArrowLeft,
    faPlus,
    faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons"
import {toGigabytesString} from "../lib/utils/storage/friendlyBytes"
import {useAppShellContext} from "./store"
import {io} from "../lib/monads/result"
import {emptyCargoIndices, CargoState, Shabah, CargoIndices, CargoIndex} from "../lib/shabah/downloadClient"
import {Cargo} from "../lib/cargo/index"
import {FilterOrder, FilterChevron} from "../components/FilterChevron"
import FullScreenOverlayLoading from "../components/loadingElements/fullscreenOverlay"
import {lazyComponent} from "../components/Lazy"
import {isMod} from "../lib/utils/cargos"
import type {Permissions} from "../lib/types/permissions"
import type { DeepReadonly } from "../lib/types/utility"
import { sleep } from "../lib/utils/sleep"
import type { FileDetails } from "../components/cargo/CargoFileSystem"
import { FileSystemBreadcrumbs } from "../components/cargo/FileSystemBreadcrumbs"
import type {CargoDirectory} from "../components/cargo/CargoFileSystem"
import {SMALL_SCREEN_MINIMUM_WIDTH_PX} from "../lib/utils/consts/styles"
import {ScreenSize} from "../components/ScreenSize"
import { ADDONS_MODAL, ADDONS_VIEWING_CARGO } from "../lib/utils/searchParameterKeys"
import {useSearchParams} from "../hooks/searchParams"
import LoadingIcon from "../components/LoadingIcon"

const FileOverlay = lazyComponent(
    async () => (await import("../components/cargo/FileOverlay")).FileOverlay,
    {loadingElement: FullScreenOverlayLoading}
)
const CargoInfo = lazyComponent(
    async () => (await import("../components/cargo/CargoInfo")).CargoInfo,
    {loadingElement: FullScreenOverlayLoading}
)
const Installer = lazyComponent(
    async () => (await import("../components/cargo/Installer")).Installer,
    {loadingElement: FullScreenOverlayLoading}
)
const StatusAlert = lazyComponent(
    async () => (await import("../components/StatusAlert")).StatusAlert
)
const CargoUpdater = lazyComponent(
    async () => (await import("../components/cargo/Updater")).CargoUpdater,
    {loadingElement: FullScreenOverlayLoading}
)
const mainContentLoader = <div className="mt-16 w-4/5 mx-auto">
    <div className="animate-spin text-blue-500 text-3xl mb-3">
        <LoadingIcon/>
    </div>
    <div className="text-sm text-neutral-300">
        {"Looking up Files..."}
    </div>
</div>
const CargoFileSystem = lazyComponent(
    async () => (await import ("../components/cargo/CargoFileSystem")).CargoFileSystem,
    {loadingElement: mainContentLoader}
)
const CargoList = lazyComponent(
    async () => (await import("../components/cargo/CargoList")).CargoList,
    {loadingElement: mainContentLoader}
)
const LargeMenu = lazyComponent(
    async () => (await import("../components/add-ons/LargeAddonMenu")).LargeAddonMenu,
    {loadingElement: <div className="w-60 h-full"/>}
)
const SmallMenu = lazyComponent(
    async () => (await import("../components/add-ons/SmallAddonsMenu")).SmallAddonsMenu,
    {loadingElement: <div style={{height: "50px"}}/>}
)

const cargoStateToNumber = (state: CargoState) => {
    switch (state) {
        case "aborted":
        case "failed":
            return 3
        case "updating":
            return 2
        case "cached":
            return 1
        default:
            return 0
    }
}

type ShownModal = (
    ""
    | "FileOverlay"
    | "Updater"
    | "Installer"
    | "CargoInfo"
)

type FilterType = "updatedAt" | "bytes" | "state" | "addon-type" | "name"

type FilterConfig = {
    type: FilterType
    order: FilterOrder
}

type AlertConfig = {
    type: "info" | "error" | "success" | "warning"
    content: ReactNode
}

const AddOns = (): JSX.Element => {
    const app = useAppShellContext()
    const {downloadClient} = useAppShellContext()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    
    const [loadingInitialData, setLoadingInitialData] = useState(true)
    const [isInErrorState, setIsInErrorState] = useState(false)
    const [cargoIndex, setCargoIndex] = useState<DeepReadonly<CargoIndices>>(emptyCargoIndices())
    const [searchText, setSearchText] = useState("")
    const [filterConfig, setFilterConfig] = useState<FilterConfig>({type: "updatedAt", order: "descending"})
    const [cargoFound, setCargoFound] = useState(true)
    const [viewingCargoIndex, setViewingCargoIndex] = useState(0)
    const [directoryPath, setDirectoryPath] = useState<CargoDirectory[]>([])
    const [fileDetails, setFileDetails] = useState<FileDetails | null>(null)
    const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null)
    const [modalShown, setModalShown] = useState<ShownModal>("")

    const viewingCargoBytes = useRef(0)
    const {current: toggleFilter} = useRef((filterName: FilterType, order: FilterOrder, currentFilter: FilterType) => {
        if (currentFilter !== filterName) {
            setFilterConfig({type: filterName, order: "descending"})
        } else if (order === "descending") {
            setFilterConfig((previous) => ({...previous, order: "ascending"}))
        } else {
            setFilterConfig((previous) => ({...previous, order: "descending"}))
        }
    })
    const targetCargoRef = useRef(new Cargo<Permissions>())
    const storageUsageRef = useRef({used: 0, total: 0, left: 0})
    const {current: setSearchKey} = useRef((key: string, value: string) => {
        searchParams.set(key, value)
        setSearchParams(new URLSearchParams(searchParams))
    })
    const {current: removeSearchKey} = useRef((key: string) => {
        searchParams.delete(key)
        setSearchParams(new URLSearchParams(searchParams))
    })
    const {current: onBackToCargos} = useRef(() => removeSearchKey(ADDONS_VIEWING_CARGO))
    const {current: onShowInstaller} = useRef(() => setModalShown("Installer"))
    const {current: onShowCargoInfo} = useRef(() => setSearchKey(ADDONS_MODAL, "info"))
    const {current: onShowCargoUpdater} = useRef(() => setSearchKey(ADDONS_MODAL, "update"))
    const {current: clearModal} = useRef(() => {
        removeSearchKey(ADDONS_MODAL)
        setModalShown("")
    })
    const {current: onShowSettings} = useRef(() => navigate("/settings"))
    const {current: clearAlert} = useRef(() => setAlertConfig(null))
    const {current: setViewingCargo} = useRef((canonicalUrl: string) => setSearchKey(ADDONS_VIEWING_CARGO, encodeURIComponent(canonicalUrl)))
    const targetIndexRef = useRef<CargoIndex>({
        name: "",
        tag: -1,
        logo: "",
        resolvedUrl: "",
        canonicalUrl: "",
        bytes: 0,
        entry: "",
        version: "",
        permissions: [],
        state: "cached",
        downloadId: "",
        created: 0,
        updated: 0,
    })

    const {current: cargoFilters} = useRef([
        {targetFilter: "name", name: "Name", className: "w-1/2 lg:w-1/3"},
        {targetFilter: "state", name: "Status", className: "hidden lg:block w-1/6 text-center"},
        {targetFilter: "addon-type", name: "Type", className: "hidden md:block w-1/6 text-center"},
        {targetFilter: "updatedAt", name: "Date", className: "w-1/4 md:w-1/6 text-center"},
        {targetFilter: "bytes", name: "Size", className: "w-1/4 md:w-1/6 text-center"},
    ] as const)
    const {current: filesystemFilters} = useRef([
        {targetFilter: "name", name: "Name", className: "w-1/2"},
        {targetFilter: "", name: "Type", className: "w-1/4 md:w-1/6 text-center"},
        {targetFilter: "", name: "Date", className: "hidden md:block w-1/6 text-center"},
        {targetFilter: "bytes", name: "Size", className: "w-1/4 md:w-1/6 text-center"},
    ] as const)

    const totalStorageBytes = useMemo(() => {
        return cargoIndex.cargos.reduce(
            (total, next) => total + next.bytes, 
            0
        )
    }, [cargoIndex])

    const isViewingCargo = searchParams.has(ADDONS_VIEWING_CARGO)
    const {current: storageUsage} = storageUsageRef
    const {current: targetCargo} = targetCargoRef

    useEffect(() => {
        if (!searchParams.has(ADDONS_MODAL)) {
            return
        } 
        const value = searchParams.get(ADDONS_MODAL) || ""
        if (value === "update") {
            setModalShown("Updater")
        } else if (value === "info") {
            setModalShown("CargoInfo")
        }
    }, [searchParams])

    useEffectAsync(async () => {
        if (cargoIndex.cargos.length < 1) {
            return 
        }
        if (!searchParams.has(ADDONS_VIEWING_CARGO)) {
            setFilterConfig({type: "updatedAt", order: "descending"})
            return
        }
        const canonicalUrl = decodeURIComponent(searchParams.get(ADDONS_VIEWING_CARGO) || "")
        if (
            canonicalUrl.length < 1
            || targetIndexRef.current.canonicalUrl === canonicalUrl
        ) {
            return
        }
        const index = cargoIndex.cargos.findIndex(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        if (index < 0) {
            setCargoFound(false)
            return
        }
        const targetCargoIndex = cargoIndex.cargos[index]
        targetIndexRef.current = targetCargoIndex
        const cargo = await downloadClient.getCargoAtUrl(
            targetCargoIndex.canonicalUrl
        )
        console.log("cargo res", cargo, "index", targetCargoIndex)
        if (!cargo.ok) {
            setCargoFound(false)
            return
        }
        viewingCargoBytes.current = cargo.data.bytes
        targetCargoRef.current = new Cargo(cargo.data.pkg as Cargo<Permissions>)
        setCargoFound(true)
        setFilterConfig({type: "name", order: "descending"})
        setViewingCargoIndex(index)
    }, [searchParams, cargoIndex])
    
    useEffectAsync(async () => {
        const [cargoIndexRes, clientStorageRes] = await Promise.all([
            io.wrap(downloadClient.getCargoIndices()),
            io.wrap(downloadClient.diskInfo()),
        ] as const)
        setLoadingInitialData(false)
        if (!clientStorageRes.ok || !cargoIndexRes.ok) {
            setIsInErrorState(true)
            return
        }
        setCargoIndex({...cargoIndexRes.data})
        storageUsageRef.current = clientStorageRes.data
    }, [])

    const filteredCargos = useMemo(() => {
        if (isViewingCargo) {
            return cargoIndex.cargos
        }
        const {order, type: filter} = filterConfig
        const orderFactor = order === "ascending" ? 1 : -1
        const copy = []
        for (let i = 0; i < cargoIndex.cargos.length; i++) {
            const targetCargo = cargoIndex.cargos[i]
            if (!targetCargo.name.includes(searchText)) {
                continue
            }
            copy.push({...targetCargo})
        }
        switch (filter) {
            case "updatedAt":
                return copy.sort((a, b) => {
                    const order = a.updated > b.updated ? 1 : -1
                    return order * orderFactor
                })
            case "bytes":
                return copy.sort((a, b) => {
                    const order = a.bytes > b.bytes ? 1 : -1
                    return order * orderFactor
                })
            case "state":
                return copy.sort((a, b) => {
                    const stateA = cargoStateToNumber(a.state)
                    const stateB = cargoStateToNumber(b.state)
                    const order = stateA > stateB ? 1 : -1
                    return order * orderFactor
                })
            case "addon-type":
                return copy.sort((a, b) => {
                    const order = isMod(a) && !isMod(b) ? 1 : -1
                    return order * orderFactor
                })
            case "name":
                return copy.sort((a, b) => {
                    // the extra -1 here is to make descending order yield
                    // a result of names ordered from a to z, not z to a
                    return a.name.localeCompare(b.name) * -1 * orderFactor
                })
            default:
                return copy
        }
    }, [filterConfig, cargoIndex, searchText])

    useEffect(() => {
        const handerId = app.addEventListener("downloadprogress", async (progress) => {
            const {type} = progress
            if (type === "install") {
                return
            }
            console.log("got progress", progress)
            let nextState: CargoState = "cached"
            if (type === "abort") {
                nextState = "aborted"
            }
            if (type === "fail") {
                nextState = "failed"
            }
            const copy = {...cargoIndex}
            const targetIndexes = progress.canonicalUrls
                .map((url) => copy.cargos.findIndex((cargo) => cargo.canonicalUrl === url))
                .filter((index) => index > -1)
            const {cargos} = copy
            for (const index of targetIndexes) {
                cargos.splice(index, 1, {
                    ...cargos[index], 
                    state: nextState,
                    downloadId: ""
                })
            }
            await sleep(5_000)
            setCargoIndex(copy)
        })
        return () => { app.removeEventListener("downloadprogress", handerId) }
    })

    return <FullScreenLoadingOverlay 
        loading={loadingInitialData}
    >
        {isInErrorState ? <ErrorOverlay>
            <div className="text-neutral-400 mb-1">
                An error occurred when search for files
            </div>
            <Link to="/start">
                <Button>
                    Back to Home
                </Button>
            </Link>
        </ErrorOverlay> : <>
            <div className="fixed z-0 w-screen h-screen overflow-clip">
                {modalShown === "FileOverlay" && fileDetails ? <>
                    <FileOverlay 
                        onClose={() => setFileDetails(null)}
                        {...fileDetails}
                    />
                </> : <></>}

                {isViewingCargo && cargoFound && modalShown === "CargoInfo" ? <>
                    <CargoInfo
                        onClose={clearModal}
                        cargo={targetCargo}
                        cargoIndex={cargoIndex.cargos[viewingCargoIndex]}
                    />
                </> : <></>}

                {modalShown === "Installer" ? <>
                    <Installer
                        onClose={clearModal}
                        onInstallCargo={async (update, title) => {
                            const status = await downloadClient.executeUpdates(
                                [update],
                                title
                            )
                            console.log("dl status", status)
                            const indexes = await downloadClient.getCargoIndices()
                            setCargoIndex({...indexes})
                            const ok = !(status.data >= Shabah.ERROR_CODES_START)
                            return ok 
                        }}
                        createAlert={(content) => setAlertConfig({type: "success", content})}
                    />
                </> : <></>}

                {!!alertConfig ? <StatusAlert
                    onClose={clearAlert}
                    autoClose={4_000}
                    color={alertConfig.type}
                    content={alertConfig.content}
                    className="fixed left-2 z-20 w-52"
                    style={{top: "91vh"}}
                /> : <></>}

                {isViewingCargo && cargoFound && modalShown === "Updater" ? <CargoUpdater
                    onClose={clearModal}
                    cargoIndex={cargoIndex.cargos[viewingCargoIndex]}
                    cargo={targetCargo}
                    createAlert={(content) => {
                        setAlertConfig({type: "success", content})
                    }}
                    onUpdateCargo={async (update, title) => {
                        const status = await downloadClient.executeUpdates(
                            [update],
                            title
                        )
                        console.log("update queue status", status)
                        const ok = !(status.data >= Shabah.ERROR_CODES_START)
                        if (!ok) {
                            return false
                        }
                        const indexes = await downloadClient.getCargoIndices()
                        const copy = {...indexes}
                        const targetIndex = copy.cargos.findIndex(
                            (cargo) => cargo.canonicalUrl === cargoIndex.cargos[viewingCargoIndex].canonicalUrl
                        )
                        if (targetIndex < 0) {
                            return true
                        }
                        indexes.cargos.splice(targetIndex, 1, {
                            ...copy.cargos[targetIndex],
                            state: "updating"
                        })
                        setCargoIndex(copy)
                        return true
                    }}
                /> : <></>}

                <div className="w-full relative z-0 sm:h-1/12 flex items-center justify-center">

                    <div className="hidden sm:block w-60">
                        <div className="ml-2">
                            <Tooltip title="Back">
                                <Link to="/start">
                                    <IconButton size="large">
                                        <span className="text-xl">
                                            <FontAwesomeIcon 
                                                icon={faArrowLeft}
                                            />
                                        </span>
                                    </IconButton>
                                </Link>
                            </Tooltip>
                        </div>
                    </div>

                    <div className="w-11/12 sm:w-4/5">
                        <ScreenSize maxWidth={SMALL_SCREEN_MINIMUM_WIDTH_PX}>
                            <SmallMenu
                                onShowSettings={onShowSettings}
                            />
                        </ScreenSize>

                        <div className="w-full mb-2 sm:mb-0 sm:w-3/5 sm:ml-1.5">
                            <TextField
                                fullWidth
                                size="small"
                                id="add-ons-search-bar"
                                name="search-bar"
                                className="rounded"
                                placeholder={`${isViewingCargo && cargoFound ? "File, folders" : "Add-on"}...`}
                                value={searchText}
                                onChange={(event) => setSearchText(event.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">
                                        <span className="text-neutral-300">
                                            <FontAwesomeIcon
                                                icon={faMagnifyingGlass}
                                            />
                                        </span>
                                    </InputAdornment>
                                }}
                            />
                        </div>
                    </div>

                </div>

                <div className="sm:hidden w-11/12 mx-auto">
                    <div className="pb-2 text-xs text-neutral-300">
                        <span className="ml-1 mr-2 text-blue-500">
                            <FontAwesomeIcon icon={faHardDrive}/>
                        </span>

                        {loadingInitialData ? <span 
                            className="animate-pulse"
                        >
                            {"calculating..."}
                        </span> : <>
                            {isInErrorState
                                ? "unknown"
                                : `${toGigabytesString(storageUsage.used, 1)} / ${toGigabytesString(storageUsage.total, 1)} used` 
                            }
                            <span className="text-neutral-400 ml-1.5">
                                {`(${cargoIndex.cargos.length} Add-ons)`}
                            </span>
                        </>}
                    
                    </div>
                </div>
                
                <div className="w-full relative z-0 h-10/12 sm:h-11/12 flex items-center justify-center">
                    <Divider className="bg-neutral-200"/>

                    <div className="sm:hidden absolute z-20 bottom-2 right-4">
                        <Tooltip title="New Add-on" placement="left">
                            <Fab 
                                onClick={onShowInstaller}
                                color="primary"
                            >
                                <FontAwesomeIcon 
                                    icon={faPlus}
                                />
                            </Fab>
                        </Tooltip>
                    </div>

                    <ScreenSize minWidth={SMALL_SCREEN_MINIMUM_WIDTH_PX}>
                        <LargeMenu
                            cargoCount={cargoIndex.cargos.length}
                            storageUsage={storageUsage}
                            isError={isInErrorState}
                            loading={loadingInitialData}
                            className="w-60 h-full text-sm"
                            onShowInstaller={onShowInstaller}
                            onShowStats={() => {}}
                            onShowSettings={onShowSettings}
                        />
                    </ScreenSize>
                    
                    <div className="w-11/12 sm:w-4/5 h-full">
                        <Divider className="bg-neutral-200"/>
                        
                        <FileSystemBreadcrumbs 
                            isViewingCargo={isViewingCargo}
                            cargoFound={cargoFound}
                            directoryPath={directoryPath}
                            targetCargo={cargoFound
                                ? cargoIndex.cargos[viewingCargoIndex]
                                : null
                            }
                            onBackToCargos={onBackToCargos}
                            mutateDirectoryPath={setDirectoryPath}
                            onShowCargoInfo={onShowCargoInfo}
                            onShowCargoUpdater={onShowCargoUpdater}
                            onDeleteCargo={async (canonicalUrl) => {
                                const copy = [...cargoIndex.cargos]
                                copy.splice(viewingCargoIndex, 1)
                                setCargoIndex({...cargoIndex, cargos: copy})
                                onBackToCargos()
                                await downloadClient.deleteCargo(canonicalUrl)
                                setAlertConfig({type: "success", content: "Deleted Successfully"})
                            }}
                        />
                        
                        <Divider className="bg-neutral-200"/>
                        
                        <div className="w-full sm:w-11/12 h-full">

                            <div className="px-4 py-2 flex justify-center items-center text-xs lg:text-base text-neutral-300 mr-3">
                                {isViewingCargo && cargoFound ? <>
                                    {filesystemFilters.map((filesystemFilter, index) => {
                                        const {targetFilter, className, name} = filesystemFilter
                                        return <div
                                            key={`filesystem-filter-${index}`}
                                            className={className}
                                        >
                                            <button
                                                className={`${targetFilter === "" ? "" : "hover:bg-gray-900"} rounded px-2 py-1`}
                                                {...(targetFilter === "" 
                                                    ? {disabled: true}
                                                    : {onClick: () => toggleFilter(targetFilter, filterConfig.order, filterConfig.type)}
                                                )}
                                            >
                                                {name}
                                                {targetFilter === "" ? <></> : <>
                                                    <FilterChevron 
                                                        currentFilter={filterConfig.type}
                                                        targetFilter={targetFilter}
                                                        order={filterConfig.order}
                                                        className="ml-1 lg:ml-2 text-blue-500"
                                                    />
                                                </>}
                                            </button>
                                        </div>
                                    })}
                                </> : <>
                                    {cargoFilters.map((cargoFilter, index) => {
                                        const {targetFilter, name, className} = cargoFilter
                                        return <div
                                            key={`cargo-filter-${index}`}
                                            className={className}
                                        >
                                            <button
                                                className="hover:bg-gray-900 rounded px-2 py-1"
                                                onClick={() => toggleFilter(targetFilter, filterConfig.order, filterConfig.type)}
                                            >
                                                {name}
                                                <FilterChevron 
                                                    currentFilter={filterConfig.type}
                                                    targetFilter={targetFilter}
                                                    order={filterConfig.order}
                                                    className="ml-1 lg:ml-2 text-blue-500"
                                                />
                                            </button>
                                        </div>
                                    })}
                                </>}
                                
                            </div>

                            <Divider className="bg-neutral-200"/>


                            {isViewingCargo ? <>
                                <div className="w-full h-5/6 overflow-y-scroll text-center animate-fade-in-left">
                                    {!cargoFound ? <>
                                        <div className="text-yellow-500 mt-16 mb-3">
                                            <span className="mr-2">
                                                <FontAwesomeIcon
                                                    icon={faPuzzlePiece}
                                                />
                                            </span>
                                            {"Add-on not found"}
                                        </div>
                                        <div>
                                            <Button onClick={onBackToCargos} size="large">
                                                Back
                                            </Button>
                                        </div>
                                    </> : <>
                                        <CargoFileSystem 
                                            cargoIndex={cargoIndex.cargos[viewingCargoIndex]}
                                            cargo={targetCargo}
                                            searchText={searchText}
                                            cargoBytes={viewingCargoBytes.current}
                                            lastPackageUpdate={cargoIndex.updatedAt}
                                            totalStorageBytes={totalStorageBytes}
                                            filter={filterConfig}
                                            directoryPath={directoryPath}
                                            onOpenFileModal={(details) => {
                                                setFileDetails(details)
                                                setModalShown("FileOverlay")
                                            }}
                                            onBackToCargos={onBackToCargos}
                                            mutateDirectoryPath={setDirectoryPath}
                                        /> 
                                    </>}
                                </div>
                            </> : <>
                                <CargoList
                                    cargosIndexes={filteredCargos}
                                    hasMore={false}
                                    onViewCargo={setViewingCargo}
                                />
                            </>}
                        </div>
                    </div>
                    
                </div>
            </div>
        </>}
    </FullScreenLoadingOverlay>
}

export default AddOns