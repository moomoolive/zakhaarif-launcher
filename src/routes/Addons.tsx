import {useState, useMemo, useRef, useEffect, ReactNode} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {
    Button, 
    Tooltip,
    Fab,
    TextField,
    InputAdornment,
    Divider,
    IconButton,
    Collapse,
    Skeleton
} from "@mui/material"
import {Link, useNavigate} from "react-router-dom"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faPuzzlePiece, 
    faHardDrive,
    faArrowLeft,
    faPlus,
    faMagnifyingGlass,
    faClock,
    faFolder,
} from "@fortawesome/free-solid-svg-icons"
import {toGigabytesString} from "../lib/utils/storage/friendlyBytes"
import {useAppContext} from "./store"
import {Shabah, ManifestIndex} from "../lib/shabah/downloadClient"
import {HuzmaManifest} from "huzma"
import {
    ASCENDING_ORDER,
    DESCENDING_ORDER,
    FilterOrder, 
    FilterChevron
} from "../components/FilterChevron"
import {lazyComponent} from "../components/Lazy"
import type {Permissions} from "../lib/types/permissions"
import { sleep } from "../lib/utils/sleep"
import type { FileDetails } from "../components/manifest/CargoFileSystem"
import { FileSystemBreadcrumbs } from "../components/manifest/FileSystemBreadcrumbs"
import type {CargoDirectory} from "../components/manifest/CargoFileSystem"
import {SMALL_SCREEN_MINIMUM_WIDTH_PX} from "../lib/utils/consts/styles"
import {ScreenSize} from "../components/ScreenSize"
import { ADDONS_INFO_MODAL, ADDONS_MODAL, ADDONS_UPDATE_MODAL, ADDONS_VIEWING_CARGO } from "../lib/utils/searchParameterKeys"
import {useSearchParams} from "../hooks/searchParams"
import { roundDecimal } from "../lib/math/rounding"
import { MILLISECONDS_PER_SECOND } from "../lib/utils/consts/time"
import { useDebounce } from "../hooks/debounce"
import {CargoFileSystemSkeleton} from "../components/manifest/CargoFileSystemSkeleton"
import {debugStatusCode} from "../lib/shabah/debug"

const fullScreenLoadingOverlay = <div
    className="fixed bg-neutral-900/80 z-20 w-screen h-screen overflow-clip flex items-center justify-center"
>
    <div className="w-5/6 max-w-md py-3 h-60 rounded bg-neutral-800 animate-fade-in-left animate-pulse"/>
</div>

const FileOverlay = lazyComponent(
    async () => (await import("../components/manifest/FileOverlay")).FileOverlay,
    {loadingElement: fullScreenLoadingOverlay}
)
const CargoInfo = lazyComponent(
    async () => (await import("../components/manifest/CargoInfo")).CargoInfo,
    {loadingElement: fullScreenLoadingOverlay}
)
const Installer = lazyComponent(
    async () => (await import("../components/manifest/Installer")).Installer,
    {loadingElement: fullScreenLoadingOverlay}
)
const StatusAlert = lazyComponent(
    async () => (await import("../components/StatusAlert")).StatusAlert
)
const CargoUpdater = lazyComponent(
    async () => (await import("../components/manifest/Updater")).CargoUpdater,
    {loadingElement: fullScreenLoadingOverlay}
)
const CargoFileSystem = lazyComponent(
    async () => (await import ("../components/manifest/CargoFileSystem")).CargoFileSystem,
    {loadingElement: CargoFileSystemSkeleton}
)
const CargoListSkeleton = <div className="w-full h-5/6 overflow-y-scroll">
    {new Array<number>(6).fill(0).map((_, index) => {
        return <div
            key={`cargo-index-skeleton-${index}`}
            className="flex p-4 justify-center items-center animate-pulse"
        >
            <div className="w-1/3">
                <FontAwesomeIcon icon={faFolder}/>
            </div>
            
            <div className="w-2/3 px-2">
                <Skeleton animation={false}/>
            </div>
        </div>
    })}
</div>
const CargoList = lazyComponent(
    async () => (await import("../components/manifest/CargoList")).CargoList,
    {loadingElement: CargoListSkeleton}
)
const LargeMenu = lazyComponent(
    async () => (await import("../components/add-ons/LargeAddonMenu")).LargeAddonMenu,
    {loadingElement: <div className="w-60 h-full"/>}
)
const SmallMenu = lazyComponent(
    async () => (await import("../components/add-ons/SmallAddonsMenu")).SmallAddonsMenu,
    {loadingElement: <div style={{height: "50px"}}/>}
)
const RecoveryModal = lazyComponent(
    async () => (await import("../components/manifest/RecoveryModal")).RecoveryModal,
    {loadingElement: fullScreenLoadingOverlay}
)

type ShownModal = (
    ""
    | "FileOverlay"
    | "Updater"
    | "Installer"
    | "CargoInfo"
    | "Recovery"
)

type FilterType = "updated" | "bytes" | "state" | "tag" | "name"

type FilterConfig = {
    type: FilterType
    order: FilterOrder
}

type AlertConfig = {
    type: "info" | "error" | "success" | "warning"
    content: ReactNode
}

const PAGE_LIMIT = 25
const FILE_SYSTEM_FILTERS = [
    {targetFilter: "name", name: "Name", className: "w-1/2"},
    {targetFilter: "", name: "Type", className: "w-1/4 md:w-1/6 text-center"},
    {targetFilter: "", name: "Date", className: "hidden md:block w-1/6 text-center"},
    {targetFilter: "bytes", name: "Size", className: "w-1/4 md:w-1/6 text-center"},
] as const
const CARGO_FILTERS = [
    {targetFilter: "name", name: "Name", className: "w-1/2 lg:w-1/3"},
    {targetFilter: "state", name: "Status", className: "hidden lg:block w-1/6 text-center"},
    {targetFilter: "tag", name: "Type", className: "hidden md:block w-1/6 text-center"},
    {targetFilter: "updated", name: "Date", className: "w-1/4 md:w-1/6 text-center"},
    {targetFilter: "bytes", name: "Size", className: "w-1/4 md:w-1/6 text-center"},
] as const

const AddOns = (): JSX.Element => {
    const app = useAppContext()
    const {downloadClient, database, logger} = useAppContext()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    const textSearchDelay = useDebounce(300)
    
    const [queryLoading, setQueryLoading] = useState(true)
    const [searchText, setSearchText] = useState("")
    const [filterConfig, setFilterConfig] = useState<FilterConfig>({type: "updated", order: DESCENDING_ORDER})
    const [directoryPath, setDirectoryPath] = useState<CargoDirectory[]>([])
    const [fileDetails, setFileDetails] = useState<FileDetails | null>(null)
    const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null)
    const [modalShown, setModalShown] = useState<ShownModal>("")
    const [offset, setOffset] = useState(0)
    const [targetIndex, setTargetIndex] = useState<ManifestIndex | null>(null)
    const [cacheBusterId, setCacheBusterId] = useState(0)
    const [storageUsage, setStorageUsage] = useState({used: 0, left: 0, total: 0})
    const [cargoCount, setCargoCount] = useState(0)
    const [latestUpdate, setLatestUpdate] = useState(Date.now())

    const viewingCargoBytes = useRef(0)
    const {current: toggleFilter} = useRef((filterName: FilterType, order: FilterOrder, currentFilter: FilterType) => {
        if (currentFilter !== filterName) {
            setFilterConfig({type: filterName, order: DESCENDING_ORDER})
        } else if (order === DESCENDING_ORDER) {
            setFilterConfig((previous) => ({...previous, order: ASCENDING_ORDER}))
        } else {
            setFilterConfig((previous) => ({...previous, order: DESCENDING_ORDER}))
        }
        setOffset(0)
    })
    const targetCargoRef = useRef(new HuzmaManifest<Permissions>())
    const {current: setSearchKey} = useRef((key: string, value: string) => {
        searchParams.set(key, value)
        setSearchParams(new URLSearchParams(searchParams))
    })
    const {current: removeSearchKey} = useRef((key: string) => {
        searchParams.delete(key)
        setSearchParams(new URLSearchParams(searchParams))
    })
    const {current: onBackToCargos} = useRef(() => {
        removeSearchKey(ADDONS_VIEWING_CARGO)
        setFilterConfig({type: "updated", order: DESCENDING_ORDER})
    })
    const {current: onShowInstaller} = useRef(() => setModalShown("Installer"))
    const {current: onShowRecovery} = useRef(() => setModalShown("Recovery"))
    const {current: onShowCargoInfo} = useRef(() => setSearchKey(ADDONS_MODAL, ADDONS_INFO_MODAL))
    const {current: onShowCargoUpdater} = useRef(() => setSearchKey(ADDONS_MODAL, ADDONS_UPDATE_MODAL))
    const {current: clearModal} = useRef(() => {
        removeSearchKey(ADDONS_MODAL)
        setModalShown("")
    })
    const {current: onShowSettings} = useRef(() => navigate("/settings"))
    const {current: clearAlert} = useRef(() => setAlertConfig(null))
    const {current: setViewingCargo} = useRef((canonicalUrl: string) => {
        const url = encodeURIComponent(canonicalUrl)
        setSearchKey(ADDONS_VIEWING_CARGO, url)
        setFilterConfig({type: "name", order: DESCENDING_ORDER})
    })
    const queryTimeRef = useRef(0)

    const onDeleteCargo = async (canonicalUrl: string) => {
        onBackToCargos()
        const deleteResponse = await downloadClient.deleteCargo(canonicalUrl)
        logger.info("Delete operation returned with code", deleteResponse)
        const targetIndex = cargoQuery.results.findIndex(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        if (targetIndex < 0) {
            return true
        }
        cargoQuery.results.splice(targetIndex, 1)
        setCargoQuery({...cargoQuery})
        setCargoCount((previous) => previous - 1)
        return true
    }

    useEffect(() => {
        if (!searchParams.has(ADDONS_MODAL)) {
            return
        } 
        const value = searchParams.get(ADDONS_MODAL) || ""
        if (value === ADDONS_UPDATE_MODAL) {
            setModalShown("Updater")
        } else if (value === ADDONS_INFO_MODAL) {
            setModalShown("CargoInfo")
        }
    }, [searchParams])

    const [cargoQuery, setCargoQuery] = useState({
        results: [] as ManifestIndex[],
        more: true,
        order: -1 as FilterOrder,
        filter: "",
        offset: 0,
        cacheBusterId: 0,
        searchText: ""
    })

    useEffectAsync(async () => {
        const [count, storageUsage, timestamp] = await Promise.all([
            database.cargoIndexes.cargoCount(),
            downloadClient.diskInfo(),
            database.cargoIndexes.latestUpdateTimestamp()
        ] as const)
        setStorageUsage(storageUsage)
        setCargoCount(count)
        setLatestUpdate(timestamp)
    }, [])

    useEffectAsync(async () => {
        if (searchParams.has(ADDONS_VIEWING_CARGO)) {
            return
        }
        const sameQuery = (
            cargoQuery.filter === filterConfig.type
            && cargoQuery.order === filterConfig.order
            && cargoQuery.offset === offset
            && cargoQuery.cacheBusterId === cacheBusterId
            && cargoQuery.searchText === searchText
        )
        if (sameQuery) {
            return
        }

        if (searchText.length > 0) {
            const {order, type} = filterConfig
            setQueryLoading(true)
            textSearchDelay(async () => {
                const start = Date.now()
                const query = await database.cargoIndexes.similaritySearch({
                    text: searchText,
                    sort: type,
                    order,
                    limit: 25
                })
                setCargoQuery({
                    results: query,
                    order,
                    filter: type,
                    offset: 0,
                    more: false,
                    cacheBusterId,
                    searchText
                })
                queryTimeRef.current = Date.now() - start
                setQueryLoading(false)
            })
            return
        }
        setQueryLoading(offset === 0)
        const queryMinimumTime = sleep(300)
        const start = Date.now()
        const query = await database.cargoIndexes.orderedQuery({
            sort: filterConfig.type,
            order: filterConfig.order,
            offset,
            limit: PAGE_LIMIT
        })
        queryTimeRef.current = Date.now() - start
        const moreResults = query.length >= PAGE_LIMIT
        await queryMinimumTime
        setCargoQuery({
            results: offset <= 0
                ? query
                : [...cargoQuery.results, ...query],
            more: moreResults,
            order: filterConfig.order,
            filter: filterConfig.type,
            offset,
            cacheBusterId,
            searchText: "",
        })
        setQueryLoading(false)
    }, [searchParams, filterConfig, searchText, offset])

    useEffectAsync(async () => {
        if (!searchParams.has(ADDONS_VIEWING_CARGO)) {
            setOffset(0)
            setFilterConfig({type: "updated", order: DESCENDING_ORDER})
            return
        }
        const canonicalUrl = decodeURIComponent(searchParams.get(ADDONS_VIEWING_CARGO) || "")
        if (
            canonicalUrl.length < 1
            || targetIndex?.canonicalUrl === canonicalUrl
        ) {
            return
        }
        const index = await database.cargoIndexes.getIndex(
            canonicalUrl
        )
        if (!index) {
            return
        }
        const cargo = await downloadClient.getCargoAtUrl(canonicalUrl)
        if (!cargo.ok) {
            return
        }
        setTargetIndex(index)
        setFilterConfig({type: "name", order: DESCENDING_ORDER})
        viewingCargoBytes.current = cargo.data.bytes
        targetCargoRef.current = new HuzmaManifest(cargo.data.pkg as HuzmaManifest<Permissions>)
    }, [searchParams])

    useEffect(() => {
        const handerId = app.addEventListener("downloadprogress", async (progress) => {
            logger.info("Notified of progress update. message =", progress)
            const {type, canonicalUrls} = progress
            if (type === "install") {
                return
            }
            await sleep(5_000)
            const consumeResponse = await downloadClient.consumeQueuedMessages()
            logger.info(
                `consumed incoming messages. Consume operation returned with code`, 
                consumeResponse,
                `("${(debugStatusCode(consumeResponse))}")`
            )

            const urlMap = new Map(canonicalUrls.map((url) => [url, 1]))
            const newResultsResponse = await Promise.all(
                canonicalUrls.map((url) => database.cargoIndexes.getIndex(url))
            )

            setCargoQuery((previous) => {
                for (let i = 0; i < previous.results.length; i++) {
                    const previousCargo = previous.results[i]
                    if (!urlMap.has(previousCargo.canonicalUrl)) {
                        continue
                    }
                    const replacement = newResultsResponse.find(
                        (cargo) => cargo?.canonicalUrl ===  previousCargo.canonicalUrl
                    )
                    if (!replacement) {
                        continue
                    }
                    previous.results.splice(i, 1, replacement)
                }
                return {...previous}
            })
        })
        return () => { app.removeEventListener("downloadprogress", handerId) }
    })

    const isViewingCargo = searchParams.has(ADDONS_VIEWING_CARGO)
    const cargoFound = isViewingCargo && !!targetIndex
    const showingValidCargo = isViewingCargo && cargoFound

    return <div 
        className="fixed z-0 w-screen h-screen overflow-clip"
    >
        {modalShown === "FileOverlay" && fileDetails ? <>
            <FileOverlay 
                onClose={() => setFileDetails(null)}
                {...fileDetails}
            />
        </> : <></>}

        {showingValidCargo && modalShown === "CargoInfo" ? <>
            <CargoInfo
                onClose={clearModal}
                cargo={targetCargoRef.current}
                cargoIndex={targetIndex}
            />
        </> : <></>}

        {modalShown === "Installer" ? <>
            <Installer
                onClose={clearModal}
                onInstallCargo={async (update, title) => {
                    const status = await downloadClient.executeUpdates(
                        [update],
                        title,
                        {backgroundDownload: false}
                    )
                    app.logger.info("new install status", status)                    
                    setCargoCount((previous) => previous + 1)
                    setOffset(0)
                    setCacheBusterId((previous) => previous + 1)
                    const ok = !(status.data >= Shabah.ERROR_CODES_START)
                    return ok 
                }}
                createAlert={(content) => setAlertConfig({type: "success", content})}
                onCheckIfCanonicalCargoExists={async (canonicalUrl: string) => {
                    return !!await database.cargoIndexes.getIndex(canonicalUrl)
                }}
                onUpdateCargo={(canonicalUrl) => {
                    clearModal()
                    setViewingCargo(canonicalUrl)
                    onShowCargoUpdater()
                }}
            />
        </> : <></>}

        {!!alertConfig ? <StatusAlert
            onClose={clearAlert}
            autoClose={4_000}
            color={alertConfig.type}
            content={alertConfig.content}
            className="fixed left-2 z-30 w-52"
            style={{top: "91vh"}}
        /> : <></>}

        {showingValidCargo && modalShown === "Updater" ? <CargoUpdater
            onClose={clearModal}
            cargoIndex={targetIndex}
            cargo={targetCargoRef.current}
            createAlert={(content) => {
                setAlertConfig({type: "success", content})
            }}
            onUpdateCargo={async (update, title) => {
                const status = await downloadClient.executeUpdates(
                    [update],
                    title,
                    {backgroundDownload: false}
                )
                logger.info("update queue status", status)
                const ok = !(status.data >= Shabah.ERROR_CODES_START)
                if (!ok) {
                    return false
                }
                setCacheBusterId((previous) => previous + 1)
                setOffset(0)
                return true
            }}
        /> : <></>}

        {showingValidCargo && modalShown === "Recovery" ? <>
            <RecoveryModal
                cargoIndex={targetIndex}
                onClose={clearModal}
                onCreateAlert={(type, content) => setAlertConfig({type, content})}
                onRetryDownload={async (canonicalUrl, title) => {
                    const retryResponse = await downloadClient.retryFailedDownloads(
                        [canonicalUrl],
                        title,
                    )
                    const ok = retryResponse.data === Shabah.STATUS.updateRetryQueued
                    if (!ok) {
                        return false
                    }
                    setCacheBusterId((previous) => previous + 1)
                    setOffset(0)
                    return true
                }}
                onDeleteCargo={onDeleteCargo}
            />
        </> : <></>}

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

        <div className="sm:hidden w-11/12 mx-auto pb-1">
            <div className="text-xs text-neutral-300">
                <span className="ml-1 mr-2 text-blue-500">
                    <FontAwesomeIcon icon={faHardDrive}/>
                </span>

                {`${toGigabytesString(storageUsage.used, 1)} / ${toGigabytesString(storageUsage.total, 1)} used`}
                
                <span className="text-neutral-400 ml-1.5">
                    {`(${cargoCount.toLocaleString("en-us")} Add-ons)`}
                </span>
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
                        <FontAwesomeIcon icon={faPlus} />
                    </Fab>
                </Tooltip>
            </div>

            <ScreenSize minWidth={SMALL_SCREEN_MINIMUM_WIDTH_PX}>
                <LargeMenu
                    cargoCount={cargoCount}
                    storageUsage={storageUsage}
                    isError={false}
                    loading={false}
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
                    targetCargo={targetIndex}
                    onBackToCargos={onBackToCargos}
                    mutateDirectoryPath={setDirectoryPath}
                    onShowCargoInfo={onShowCargoInfo}
                    onShowCargoUpdater={onShowCargoUpdater}
                    onRecoverCargo={onShowRecovery}
                    onDeleteCargo={onDeleteCargo}
                    onCreateAlert={(type, content) => setAlertConfig({type, content})}
                    onGetSearchResultUrls={() => cargoQuery.results.map((result) => result.canonicalUrl)}
                />
                
                <Divider className="bg-neutral-200"/>
                
                <div className="w-full relative sm:w-11/12 h-full">

                    <div className="px-4 py-2 flex justify-center items-center text-xs lg:text-sm text-neutral-300 mr-3">
                        {isViewingCargo && cargoFound ? <>
                            {FILE_SYSTEM_FILTERS.map((filesystemFilter, index) => {
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
                            {CARGO_FILTERS.map((cargoFilter, index) => {
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
                        <CargoFileSystem
                            cargoIndex={targetIndex}
                            cargo={targetCargoRef.current}
                            searchText={searchText}
                            cargoBytes={viewingCargoBytes.current}
                            lastPackageUpdate={latestUpdate}
                            totalStorageBytes={storageUsage.used}
                            filter={filterConfig}
                            directoryPath={directoryPath}
                            onOpenFileModal={(details) => {
                                setFileDetails(details)
                                setModalShown("FileOverlay")
                            }}
                            onBackToCargos={onBackToCargos}
                            mutateDirectoryPath={setDirectoryPath}
                            onCreateAlert={(type, content) => {
                                setAlertConfig({type, content})
                            }}
                            onClearAlert={clearAlert}
                        />
                    </> : <>
                        {queryLoading ? <>
                            {CargoListSkeleton}
                        </> : <>
                            <CargoList
                                cargosIndexes={cargoQuery.results}
                                hasMore={cargoQuery.more}
                                onViewCargo={setViewingCargo}
                                onPaginate={() => { setOffset((previous) => previous + PAGE_LIMIT) }}
                            />

                            <div className="text-neutral-500 text-xs ml-1 mb-1 animate-fade-in-left">
                                <span>
                                    {`${cargoQuery.results.length.toLocaleString("en-us")} results (${Math.max(roundDecimal(queryTimeRef.current / MILLISECONDS_PER_SECOND, 2), 0.01).toFixed(2)} seconds)`}
                                </span>
                            </div>
                        </>}
                    </>}
                </div>
            </div>
            
        </div>
    </div>
}

export default AddOns