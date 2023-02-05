import {useState, useMemo, useRef} from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {FullScreenLoadingOverlay} from "../components/LoadingOverlay"
import {ErrorOverlay} from "../components/ErrorOverlay"
import {
    Button, 
    Tooltip,
    Fab,
    TextField,
    InputAdornment,
    Menu,
    MenuItem
} from "@mui/material"
import {Link, useSearchParams, useNavigate} from "react-router-dom"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faFolder, 
    faPuzzlePiece, 
    faHardDrive,
    faSignal,
    faArrowLeft,
    faPlus,
    faCaretDown,
    faBoxArchive,
    faGear,
    faMagnifyingGlass,
    faBoxesStacked,
    faAngleRight,
    faFolderTree,
    faTrash,
    faBars,
    faInfoCircle,
} from "@fortawesome/free-solid-svg-icons"
import {readableByteCount, toGigabytesString} from "../lib/utils/storage/friendlyBytes"
import {reactiveDate} from "../lib/utils/dates"
import {
    Divider, 
    LinearProgress,
    Collapse,
    IconButton
} from "@mui/material"
import {useAppShellContext} from "./store"
import {io} from "../lib/monads/result"
import {emptyCargoIndices, CargoState} from "../lib/shabah/downloadClient"
import UpdatingAddonIcon from "@mui/icons-material/Sync"
import FailedAddonIcon from "@mui/icons-material/ReportProblem"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {Cargo} from "../lib/cargo/index"
import {urlToMime, Mime} from "../lib/miniMime/index"
import {NULL_FIELD as CARGO_NULL_FIELD} from "../lib/cargo/index"
import {CargoIcon} from "../components/cargo/Icon"
import {FilterOrder, FilterChevron} from "../components/FilterChevron"
import {MimeIcon} from "../components/cargo/FileOverlay"
import FullScreenOverlayLoading from "../components/loadingElements/fullscreenOverlay"
import {lazyComponent} from "../components/Lazy"
import {isStandardCargo, isMod, isEmbeddedStandardCargo} from "../lib/utils/cargos"
import {MANIFEST_NAME} from "../lib/cargo/index"
import {VIRTUAL_FILE_HEADER} from "../lib/utils/consts/files"
import type {Permissions} from "../lib/types/permissions"

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

const filterOptions = ["updatedAt", "bytes", "state", "addon-type", "name"] as const

const cargoStateToNumber = (state: CargoState) => {
    switch (state) {
        case "update-aborted":
        case "update-failed":
            return 3
        case "updating":
            return 2
        case "cached":
            return 1
        default:
            return 0
    }
}

type FileMeta = {name: string, bytes: number}

type CargoDirectory = {
    path: string,
    contentBytes: number
    files: FileMeta[]
    directories: CargoDirectory[]
}

const addFileToDirectory = (
    directory: CargoDirectory,
    file: Readonly<FileMeta>
) => {
    const splitPath = file.name.split("/")
    if (splitPath.length < 0) {
        return 
    }
    const isFile = splitPath.length === 1
    const {bytes} = file
    if (isFile) {
        const name = splitPath.at(-1)!
        directory.files.push({name, bytes})
        return
    }
    const [nextPath] = splitPath
    const directoryIndex = directory.directories.findIndex(
        (directory) => directory.path === nextPath
    )
    const name = splitPath.slice(1).join("/")
    if (directoryIndex > -1) {
        const targetDirectory = directory.directories[directoryIndex]
        addFileToDirectory(targetDirectory, {name, bytes})
        return 
    }
    const targetDirectory: CargoDirectory = {
        path: nextPath,
        contentBytes: 0,
        files: [],
        directories: []
    }
    directory.directories.push(targetDirectory)
    addFileToDirectory(targetDirectory, {name, bytes})
}

const calculateDirectorySize = (directory: CargoDirectory) => {
    let sizeOfFilesInDirectory = 0
    for (let i = 0; i < directory.files.length; i++) {
        sizeOfFilesInDirectory += directory.files[i].bytes
    }
    if (directory.directories.length < 1) {
        directory.contentBytes = sizeOfFilesInDirectory
        return
    }
    for (let i = 0; i < directory.directories.length; i++) {
        const target = directory.directories[i]
        calculateDirectorySize(target)
    }
    let sizeOfFoldersInDirectory = 0
    for (let i = 0; i < directory.directories.length; i++) {
        const target = directory.directories[i]
        sizeOfFoldersInDirectory += target.contentBytes
    }
    directory.contentBytes = sizeOfFilesInDirectory + sizeOfFoldersInDirectory
}

type AddonListItemProps = {
    onClick: () => void | Promise<void>
    icon: JSX.Element
    name: string
    type: string
    updatedAt: number
    byteCount: number
    typeTooltip?: boolean
    status?: JSX.Element | null
    showModifiedOnSmallScreen?: boolean
}

const AddonListItem = ({
    onClick, 
    icon, 
    name,
    type,
    updatedAt,
    byteCount,
    typeTooltip = false,
    status = null,
    showModifiedOnSmallScreen = false
}: AddonListItemProps) => {
    const friendlyBytes = readableByteCount(byteCount)
    const showStatus = !!status

    return <button
        className="p-4 w-full text-left flex justify-center items-center hover:bg-neutral-900"
        onClick={onClick}
    >
        
        <div className={`relative z-0 ${showStatus ? "w-1/2 lg:w-1/3" : "w-1/2"} whitespace-nowrap text-ellipsis overflow-clip`}>
            {icon}
            {name}
        </div>
        

        {showStatus ? <>
            <div className="hidden lg:block w-1/6 text-center text-xs text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
                {status}
            </div>
        </> : <></>}

        {typeTooltip ? <>
            <Tooltip title={type}>
                <div className={`${showModifiedOnSmallScreen ? "w-1/6 hidden md:block" : "w-1/4 md:w-1/6"} text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip`}>
                    {type}
                </div>
            </Tooltip>
        </> : <>
            <div className={`${showModifiedOnSmallScreen ? "w-1/6 hidden md:block" : "w-1/4 md:w-1/6"} text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip`}>
                {type}
            </div>
        </>}
        
        <div className={`${showModifiedOnSmallScreen ? "w-1/4 md:w-1/6" : "hidden md:block w-1/6"} text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip`}>
            {reactiveDate(new Date(updatedAt))}
        </div>
        
        <div className="w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
            {`${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`}
        </div>
    </button>
}

const ROOT_DIRECTORY_PATH = "#"

const AddOns = () => {
    const {downloadClient} = useAppShellContext()
    const [searchParams, setSearchParams] = useSearchParams()
    const confirm = useGlobalConfirm()
    const navigate = useNavigate()
    
    const [loadingInitialData, setLoadingInitialData] = useState(true)
    const [isInErrorState, setIsInErrorState] = useState(false)
    const [cargoIndex, setCargoIndex] = useState(emptyCargoIndices())
    const [storageUsage, setStorageUsage] = useState({
        used: 0, total: 0, left: 0
    })
    const [searchText, setSearchText] = useState("")
    const [filter, setFilter] = useState<typeof filterOptions[number]>("updatedAt")
    const [order, setOrder] = useState<FilterOrder>("descending")
    const [viewingCargo, setViewingCargo] = useState("none")
    const [targetCargo, setTargetCargo] = useState(new Cargo<Permissions>())
    const [cargoFound, setCargoFound] = useState(false)
    const [viewingCargoIndex, setViewingCargoIndex] = useState(0)
    const [directoryPath, setDirectoryPath] = useState<CargoDirectory[]>([])
    const [showFileOverlay, setShowFileOverlay] = useState(false)
    const [fileDetails, setFileDetails] = useState({
        name: "",
        mime: "text/javascript" as Mime,
        url: "",
        fileResponse: new Response("", {status: 200}),
        bytes: 0
    })
    const [cargoOptionsElement, setCargoOptionsElement] = useState<null | HTMLButtonElement>(null)
    const [allCargosOptionsElement, setAllCargosOptionsElement] = useState<null | HTMLButtonElement>(null)
    const [mobileMainMenuElement, setMobileMainMenuElement] = useState<null | HTMLButtonElement>(null)
    const [showCargoInfo, setShowCargoInfo] = useState(false)
    const [showInstaller, setShowInstaller] = useState(true)
    
    const cargoDirectoryRef = useRef<CargoDirectory>({
        path: ROOT_DIRECTORY_PATH,
        contentBytes: 0,
        files: [],
        directories: []
    })
    
    const cargoDirectory = cargoDirectoryRef.current
    const isViewingCargo = viewingCargo !== "none"

    useEffectAsync(async () => {
        if (!isViewingCargo) {
            setFilter("updatedAt")
            setOrder("descending")
            return
        }
        const index = cargoIndex.cargos.findIndex(
            (cargo) => cargo.id === viewingCargo
        )
        if (index < 0) {
            setCargoFound(false)
            return
        }
        const targetCargoIndex = cargoIndex.cargos[index]
        const cargo = await downloadClient.getCargoAtUrl(
            targetCargoIndex.resolvedUrl
        )
        if (!cargo.ok) {
            setCargoFound(false)
            return
        }
        const cargoTarget = cargo.data.pkg
        const rootDirectory: CargoDirectory = {
            path: ROOT_DIRECTORY_PATH,
            contentBytes: 0,
            files: [],
            directories: []
        }
        for (let i = 0; i < cargoTarget.files.length; i++) {
            const {name, bytes} = cargoTarget.files[i]
            addFileToDirectory(rootDirectory, {name, bytes})
        }
        rootDirectory.files.push({
            name: cargo.data.name,
            bytes: cargo.data.bytes
        })
        calculateDirectorySize(rootDirectory)
        cargoDirectoryRef.current = rootDirectory
        setDirectoryPath([rootDirectory])
        setViewingCargoIndex(index)
        setTargetCargo(
            new Cargo(cargoTarget as Cargo<Permissions>)
        )
        setCargoFound(true)
        setFilter("name")
        setOrder("descending")
    }, [viewingCargo])
    
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
        const cargos = cargoIndexRes.data.cargos//addStandardCargosToCargoIndexes(cargoIndexRes.data.cargos)
        setCargoIndex({...cargoIndexRes.data, cargos})
        setStorageUsage(clientStorageRes.data)
    }, [])

    const filteredCargos = useMemo(() => {
        if (isViewingCargo) {
            return cargoIndex.cargos
        }
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
                    const order = a.updatedAt > b.updatedAt ? 1 : -1
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
                    const order = isMod(a.id) && !isMod(b.id)
                        ? 1
                        : -1
                    return order * orderFactor
                })
            case "name":
                return copy.sort((a, b) => {
                    return a.name.localeCompare(b.name) * orderFactor
                })
            default:
                return copy
        }
    }, [filter, order, cargoIndex, searchText, searchParams])

    const filteredDirectory = useMemo(() => {
        const viewingDirectory = directoryPath.length < 1 
            ? cargoDirectory
            : directoryPath[directoryPath.length - 1]
        const directory = {
            ...viewingDirectory
        }
        if (searchText.length > 0) {
            directory.files = directory
                .files
                .filter((file) => file.name.includes(searchText))
            directory.directories = directory
                .directories
                .filter((directory) => directory.path.includes(searchText))
        }
        const orderFactor = order === "ascending" ? 1 : -1
        switch (filter) {
            case "bytes":
                directory.directories.sort((a, b) => {
                    const order = a.contentBytes > b.contentBytes ? 1 : -1
                    return order * orderFactor
                })
                directory.files.sort((a, b) => {
                    const order = a.bytes > b.bytes ? 1 : -1
                    return order * orderFactor
                })
                break 
            case "name":
                directory.directories.sort((a, b) => {
                    const order = a.path.localeCompare(b.path)
                    return order * orderFactor
                })
                directory.files.sort((a, b) => {
                    const order = a.name.localeCompare(b.name)
                    return order * orderFactor
                })
            default:
                break
        }
        return directory
    }, [filter, order, searchText, targetCargo, directoryPath])

    const toggleFilter = (filterName: typeof filter) => {
        if (filter !== filterName) {
            setFilter(filterName)
            setOrder("descending")
        } else if (order === "descending") {
            setOrder("ascending")
        } else {
            setOrder("descending")
        }
    }

    const archiveClick = async (_id: string) => {
        if (!await confirm({title: "Are you sure you want to unarchived this add-on?"})) {
            return
        }
        console.log("unarchive package")
    }

    const onStats = () => {
        console.info("show stats")
    }

    const onSettings = () => {
        console.info("settings")
    }

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
                {showFileOverlay ? <>
                    <FileOverlay 
                        onClose={() => setShowFileOverlay(false)}
                        {...fileDetails}
                    />
                </> : <></>}

                {showCargoInfo ? <>
                    <CargoInfo
                        onClose={() => setShowCargoInfo(false)}
                        cargo={targetCargo}
                        cargoIndex={cargoIndex.cargos[viewingCargoIndex]}
                    />
                </> : <></>}

                {showInstaller ? <>
                    <Installer
                        onClose={() => setShowInstaller(false)}
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
                        <div className="sm:hidden flex my-2 text-2xl px-1">
                            <div className="w-1/3">
                                <Tooltip title="Menu" placement="left">
                                    <button
                                        onClick={() => navigate("/start")}
                                    >
                                        <FontAwesomeIcon
                                            icon={faArrowLeft}
                                        />
                                    </button>
                                </Tooltip>
                            </div>
                            <div className="w-1/3 text-center">    
                                <span className="text-green-500 mr-2">
                                    <FontAwesomeIcon
                                        icon={faPuzzlePiece}
                                    />
                                </span>
                                <span className="text-base">
                                    {"Add-ons"}
                                </span>
                            </div>
                            <div className="w-1/3 text-right">
                                <Tooltip title="Menu" placement="left">
                                    <button
                                        onClick={(event) => {
                                            setMobileMainMenuElement(event.currentTarget)
                                        }}
                                    >
                                        <FontAwesomeIcon
                                            icon={faBars}
                                        />
                                    </button>
                                </Tooltip>

                                <Menu
                                    anchorEl={mobileMainMenuElement}
                                    open={!!mobileMainMenuElement}
                                    onClose={() => setMobileMainMenuElement(null)}
                                >
                                    <MenuItem
                                        onClick={() => {
                                            if (searchParams.has("archive")) {
                                                searchParams.delete("archive")
                                                setSearchParams(searchParams)
                                            } else {
                                                setSearchParams({archive: "true"})
                                            }
                                            setMobileMainMenuElement(null)
                                        }}
                                    >
                                        {searchParams.has("archive") ? <>
                                            <span className="mr-4">
                                                <FontAwesomeIcon
                                                    icon={faBoxesStacked}
                                                />
                                            </span>
                                            Installed
                                        </> : <>
                                            <span className="mr-4">
                                                <FontAwesomeIcon 
                                                    icon={faBoxArchive}
                                                />
                                            </span>
                                            Archives
                                        </>}
                                    </MenuItem>
                                </Menu>
                            </div>
                        </div>
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
                            <FontAwesomeIcon 
                                icon={faHardDrive}
                            />
                        </span>

                        {loadingInitialData ? <span 
                            className="animate-pulse"
                        >
                            {"calculating..."}
                        </span> : <>
                            {isInErrorState
                                ? "unknown"
                                : `${toGigabytesString(storageUsage.used, 1)} of ${toGigabytesString(storageUsage.total, 1)} used` 
                            }
                        </>}
                    
                    </div>
                </div>
                
                <div className="w-full relative z-0 h-10/12 sm:h-11/12 flex items-center justify-center">
                    <Divider className="bg-neutral-200"/>

                    <div className="absolute z-20 bottom-2 right-4 sm:hidden">
                        <Fab 
                            onClick={() => setShowInstaller(true)}
                            color="primary"
                        >
                            <FontAwesomeIcon 
                                icon={faPlus}
                            />
                        </Fab>
                    </div>

                    <div className="hidden sm:block w-60 h-full text-sm">
                        <Divider className="bg-neutral-200"/>

                        <div className="p-4">
                            <span className="mr-2 text-green-500">
                                <FontAwesomeIcon
                                    icon={faPuzzlePiece}
                                />
                            </span>
                            {"Add-On Manager"}
                        </div>

                        <Divider className="bg-neutral-200"/>

                        <div className="p-4">
                            <Tooltip title="Add a New Package">
                                <span>
                                    <Fab 
                                        variant="extended" 
                                        sx={{zIndex: "10"}}
                                        onClick={() => setShowInstaller(true)}
                                    >
                                        <div className="flex items-center justify-center">
                                            <div className="mr-2">
                                                <span className="text-lg">
                                                    <FontAwesomeIcon
                                                        icon={faPlus}
                                                    />
                                                </span>
                                            </div>
                                            <div>
                                                New Package
                                            </div>
                                        </div>                                
                                    </Fab>
                                </span>
                            </Tooltip>
                        </div>
                        
                        <div className="text-lg pb-4 text-neutral-300 w-11/12 rounded-r-full">
                            <Button 
                                fullWidth 
                                disabled
                                onClick={onStats}
                            >
                                <div className="w-full pl-4 py-1 text-left">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faSignal}
                                        />
                                    </span>
                                    Stats
                                </div>
                            </Button>

                            <Collapse in={!isViewingCargo}>
                                {searchParams.has("archive") ? <>
                                    <Tooltip title="Back To Installed" placement="right">
                                        <Button 
                                            fullWidth
                                            color="success"
                                            onClick={() => {
                                                searchParams.delete("archive")
                                                setSearchParams(searchParams)
                                            }}
                                        >
                                            <div className="w-full pl-4 py-1 text-left">
                                                <span className="mr-4">
                                                    <FontAwesomeIcon
                                                        icon={faBoxesStacked}
                                                    />
                                                </span>
                                                Installed
                                                
                                            </div>
                                        </Button>
                                    </Tooltip>
                                </> : <>
                                    <Tooltip title="View Archives" placement="right">
                                        <Button 
                                            fullWidth
                                            onClick={() => setSearchParams({archive: "true"})}
                                        >
                                            <div className="w-full pl-4 py-1 text-left">
                                                <span className="mr-4">
                                                    <FontAwesomeIcon 
                                                        icon={faBoxArchive}
                                                    />
                                                </span>
                                                Archives
                                            </div>
                                        </Button>
                                    </Tooltip>
                                </>}
                            </Collapse>
                            
                            

                            <Button 
                                fullWidth 
                                disabled
                                onClick={onSettings}
                            >
                                <div className="w-full pl-4 py-1 text-left">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faGear}
                                        />
                                    </span>
                                    Settings
                                </div>
                            </Button>
                        </div>

                        <Divider className="bg-neutral-200  w-11/12"/>

                        <div className="text-lg text-neutral-300 w-11/12 rounded-r-full">
                            <Button fullWidth disabled>
                                <div className="w-full text-left pl-4">
                                    <span className="mr-4">
                                        <FontAwesomeIcon 
                                            icon={faHardDrive}
                                        />
                                    </span>
                                    Storage
                                </div>
                            </Button>
                        </div>

                        <div className="ml-16">
                            <div className="w-7/12 mb-2">
                                <LinearProgress 
                                    variant="determinate" 
                                    value={
                                        loadingInitialData || isInErrorState
                                            ? 3
                                            : Math.max(
                                                3,
                                                storageUsage.used / storageUsage.total 
                                            ) 
                                    } 
                                />
                            </div>
                            

                            <div className="py-1 text-xs">
                                {loadingInitialData ? <span 
                                    className="animate-pulse"
                                >
                                    {"calculating..."}
                                </span> : <>
                                    {isInErrorState
                                        ? "unknown"
                                        : `${toGigabytesString(storageUsage.used, 1)} of ${toGigabytesString(storageUsage.total, 1)} used` 
                                    }
                                </>}
                            
                            </div>

                            <div className="text-xs text-neutral-400">
                                1 packages
                            </div>
                        </div>

                    </div>
                    
                    <div className="w-11/12 sm:w-4/5 h-full">
                        <Divider className="bg-neutral-200"/>

                        <div className=" text-sm text-neutral-300 p-3 flex items-center flex-wrap">
                            <div>
                                {isViewingCargo ? <>
                                    <Tooltip title="My Add-ons">
                                        <button
                                            className="hover:bg-gray-900 p-1 px-2 rounded text-neutral-400"
                                            onClick={() => {
                                                if (isViewingCargo) {
                                                    return setViewingCargo("none")
                                                }
                                            }}
                                        >
                                            {"My Add-ons"}
                                        </button>
                                    </Tooltip>
                                </> : <>
                                    <button
                                        className="hover:bg-gray-900 p-1 px-2 rounded"
                                        onClick={(event) => {
                                            setAllCargosOptionsElement(event.currentTarget)
                                        }}
                                    >
                                        {"My Add-ons"}
                                        <span className="ml-2">
                                            <FontAwesomeIcon 
                                                icon={faCaretDown}
                                            />
                                        </span>
                                    </button>

                                    <Menu
                                        anchorEl={allCargosOptionsElement}
                                        open={!!allCargosOptionsElement}
                                        onClose={() => setAllCargosOptionsElement(null)}
                                    >
                                        <MenuItem
                                            className="hover:text-red-500"
                                            onClick={async () => {
                                                if (!await confirm({title: "Are you sure you want to uninstall this app?"})) {
                                                    return
                                                }
                                                await downloadClient.uninstallAllAssets()
                                                location.replace("/")
                                            }}
                                        >
                                            <span className="mr-3">
                                                <FontAwesomeIcon icon={faTrash} />
                                            </span>
                                            Uninstall App
                                        </MenuItem>
                                    </Menu>
                                </>}
                            </div>
                            
                            {isViewingCargo && !cargoFound ? <div>
                                <span className="mx-1">
                                    <FontAwesomeIcon 
                                        icon={faAngleRight}
                                    />
                                </span>
                                <button
                                    className="hover:bg-gray-900 p-1 px-2 rounded text-yellow-500"
                                >
                                    {"Not found"}
                                </button>
                            </div> : <>
                            </>}

                            {isViewingCargo && cargoFound ? <>
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
                                                        setDirectoryPath(directoryPath.slice(0, index + 1))
                                                        return
                                                    } else {
                                                        setCargoOptionsElement(event.currentTarget)
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center">
                                                    {path === ROOT_DIRECTORY_PATH && targetCargo.crateLogoUrl !== CARGO_NULL_FIELD ? <div
                                                        className="mr-1"
                                                    >
                                                        <CargoIcon 
                                                            importUrl={cargoIndex.cargos[viewingCargoIndex].resolvedUrl}
                                                            crateLogoUrl={targetCargo.crateLogoUrl}
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
                                            anchorEl={cargoOptionsElement}
                                            open={!!cargoOptionsElement}
                                            onClose={() => setCargoOptionsElement(null)}
                                        >
                                            <MenuItem
                                                className="hover:text-green-500"
                                                onClick={() => {
                                                    setShowCargoInfo(true)
                                                    setCargoOptionsElement(null)
                                                }}
                                            >
                                                <span className="mr-3">
                                                    <FontAwesomeIcon icon={faInfoCircle} />
                                                </span>
                                                Info
                                            </MenuItem>

                                            <MenuItem
                                                className="hover:text-red-500"
                                                onClick={async () => {
                                                    const target = cargoIndex.cargos[viewingCargoIndex]
                                                    if (isStandardCargo(target.id)) {
                                                        confirm({title: `"${target.name}" is a standard package and cannot be deleted!`})
                                                        return 
                                                    }
                                                    if (!await confirm({title: `Are you sure you want to delete "${target.name}" add-on?`})) {
                                                        setCargoOptionsElement(null)
                                                        return
                                                    }
                                                    setViewingCargo("none")
                                                    const copy = [...cargoIndex.cargos]
                                                    copy.splice(viewingCargoIndex, 1)
                                                    setCargoIndex({
                                                        ...cargoIndex,
                                                        cargos: copy
                                                    })
                                                    await downloadClient.deleteCargo(target.canonicalUrl)
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
                        
                        <Divider className="bg-neutral-200"/>
                        
                        <div className="w-full sm:w-11/12 h-full">

                            <div className="px-4 py-2 flex justify-center items-center text-xs lg:text-base text-neutral-300 mr-3">
                                {isViewingCargo && cargoFound ? <>
                                    <div className="w-1/2">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("name")}
                                        >
                                            Name
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="name"
                                                order={order}
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button disabled className="rounded px-2 py-1">
                                            Type
                                        </button>
                                    </div>
                                    <div className="hidden md:block w-1/6 text-center">
                                        <button disabled className="rounded px-2 py-1">
                                            Modified
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("bytes")}
                                        >
                                            Size
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="bytes"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                </> : <>
                                    <div className="w-1/2 lg:w-1/3">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("name")}
                                        >
                                            Name
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="name"
                                                order={order}
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className={`hidden lg:block w-1/6 text-center`}>
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("state")}
                                        >
                                            Status
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="state"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="hidden md:block w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("addon-type")}
                                        >
                                            Type
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="addon-type"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("updatedAt")}
                                        >
                                            <span className="hidden sm:inline">
                                                Modified
                                            </span>

                                            <span className="sm:hidden">
                                                Date
                                            </span>
                                            
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="updatedAt"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("bytes")}
                                        >
                                            Size
                                            <FilterChevron 
                                                currentFilter={filter}
                                                targetFilter="bytes"
                                                order={order} 
                                                className="ml-1 lg:ml-2 text-blue-500"
                                            />
                                        </button>
                                    </div>
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
                                            Add-on not found
                                        </div>
                                        <div>
                                            <Button 
                                                onClick={() => setViewingCargo("none")}
                                                size="large"
                                            >
                                                Back
                                            </Button>
                                        </div>
                                    </> : <>
                                        <div className="w-full h-5/6 overflow-y-scroll text-center animate-fade-in-left">
                                            {cargoDirectory.files.length < 1 && cargoDirectory.directories.length < 1 ? <>
                                                <div className="text-yellow-500 mt-16 mb-3">
                                                    <span className="mr-2">
                                                        <FontAwesomeIcon
                                                            icon={faPuzzlePiece}
                                                        />
                                                    </span>
                                                    No content in found
                                                </div>
                                                <div>
                                                    <Button 
                                                        onClick={() => setViewingCargo("none")}
                                                        size="large"
                                                    >
                                                        Back
                                                    </Button>
                                                </div>
                                            </> : <>
                                                {directoryPath.length > 0 ? <>
                                                    <Tooltip title="Back To Parent Folder" placement="top">
                                                        <div>
                                                            <AddonListItem 
                                                                onClick={() => {
                                                                    if (directoryPath.length < 2) {
                                                                        setViewingCargo("none")
                                                                    } else {
                                                                        setDirectoryPath(directoryPath.slice(0, -1))
                                                                    }
                                                                }}
                                                                icon={<span className={"mr-3 text-amber-300"}>
                                                                <FontAwesomeIcon 
                                                                        icon={faFolderTree}
                                                                    />
                                                                </span>
                                                                }
                                                                name={(() => {
                                                                    if (directoryPath.length < 2) {
                                                                        return "My Add-ons"
                                                                    }
                                                                    const lastPath = directoryPath[directoryPath.length - 2]
                                                                    if (lastPath.path === ROOT_DIRECTORY_PATH) {
                                                                        return targetCargo.name
                                                                    }
                                                                    return lastPath.path
                                                                })()}
                                                                type="parent folder"
                                                                updatedAt={
                                                                    directoryPath.length < 2 
                                                                        ? cargoIndex.updatedAt
                                                                        : cargoIndex.cargos[viewingCargoIndex].updatedAt}
                                                                byteCount={
                                                                    directoryPath.length < 2
                                                                        ? cargoIndex.cargos.reduce((total, next) => total + next.bytes, 0)
                                                                        : directoryPath[directoryPath.length - 2].contentBytes
                                                                }
                                                            />
                                                        </div>
                                                    </Tooltip>
                                                </> : <></>}

                                                {filteredDirectory.directories.map((directory, index) => {
                                                    const targetIndex = cargoIndex.cargos[viewingCargoIndex]
                                                    return <AddonListItem
                                                        key={`cargo-directory-${index}`}
                                                        onClick={() => {
                                                            setDirectoryPath([
                                                                ...directoryPath, directory
                                                            ])
                                                        }}
                                                        icon={<span className={"mr-3 text-amber-300"}>
                                                            <FontAwesomeIcon icon={faFolder}/>
                                                        </span>
                                                        }
                                                        name={directory.path}
                                                        type="folder"
                                                        updatedAt={targetIndex.updatedAt}
                                                        byteCount={directory.contentBytes}
                                                        typeTooltip
                                                    />
                                                })}
                                                {filteredDirectory.files.map((file, index) => {
                                                    const targetIndex = cargoIndex.cargos[viewingCargoIndex]
                                                    const mime = urlToMime(file.name) || "text/plain"
                                                    return <AddonListItem
                                                        key={`cargo-file-${index}`}
                                                        onClick={async () => {
                                                            const basePath = targetIndex.resolvedUrl
                                                            const path = directoryPath
                                                                .slice(1)
                                                                .reduce((total, next) => `${total}/${next.path}`, "")
                                                            const cleanedBase = basePath.endsWith("/") 
                                                                ? basePath.slice(0, -1) 
                                                                : basePath
                                                            const cleanedPathEnd = path.endsWith("/")
                                                                ? path.slice(0, -1) 
                                                                : path
                                                            const cleanedPath = cleanedPathEnd.startsWith("/")
                                                                ? path.slice(1)
                                                                : cleanedPathEnd
                                                            const fullPath = `${cleanedBase}/${directoryPath.length > 1 ? cleanedPath + "/" : cleanedPath}${file.name}`
                                                            const {id} = targetIndex
                                                            const fileResponse = await (async (cargoId: string, url: string) => {
                                                                if (
                                                                    !url.includes(MANIFEST_NAME)
                                                                    || !isEmbeddedStandardCargo(cargoId)
                                                                ) {
                                                                    return await downloadClient.getCachedFile(url)
                                                                }
                                                                return new Response(
                                                                    JSON.stringify(targetCargo), {
                                                                        status: 200,
                                                                        statusText: "OK",
                                                                        headers: {
                                                                            "content-type": "application/json",
                                                                            "content-length": file.bytes.toString(),
                                                                            [VIRTUAL_FILE_HEADER]: "1"
                                                                        }
                                                                    }
                                                                )
                                                            })(id, fullPath)
                                                            if (!fileResponse) {
                                                                console.error(`file ${fullPath} was not found although it should be cached!`)
                                                                await confirm({title: "An error occurred when fetching file!"})
                                                                return
                                                            }
                                                            setFileDetails({
                                                                name: file.name,
                                                                mime,
                                                                url: fullPath,
                                                                fileResponse,
                                                                bytes: file.bytes,
                                                            })
                                                            setShowFileOverlay(true)
                                                        }}
                                                        icon={<MimeIcon mime={mime} className="mr-3"/>}
                                                        name={file.name}
                                                        type={mime}
                                                        updatedAt={targetIndex.updatedAt}
                                                        byteCount={file.bytes}
                                                        typeTooltip
                                                    />
                                                })}
                                            </>}
                                        </div>
                                        
                                    </>}
                                </div>
                            </> : <>
                                <div className="w-full h-5/6 overflow-y-scroll animate-fade-in-left">
                                    {filteredCargos.map((cargo, index) => {
                                        const {name, bytes, updatedAt, id, state} = cargo
                                        const isAMod = isMod(id)
                                        return <AddonListItem
                                            key={`cargo-index-${index}`}
                                            onClick={() => {
                                                if (searchParams.has("archive")) {
                                                    archiveClick(id)
                                                } else {
                                                    setViewingCargo(id)
                                                }
                                            }}
                                            icon={((addonState: typeof state, mod: boolean) => {
                                                switch (addonState) {
                                                    case "update-aborted":
                                                    case "update-failed":
                                                        return <>
                                                        <span className={"mr-3"}>
                                                            <FontAwesomeIcon 
                                                                icon={faFolder}
                                                            />
                                                        </span>
                                                        <span>
                                                            {name}
                                                        </span>
                                                        <div className="absolute z-10 bottom-0 left-0 text-red-500">
                                                            <FailedAddonIcon
                                                                style={{fontSize: "12px"}}
                                                            />
                                                        </div>
                                                    </>
                                                    case "updating":
                                                        return <>
                                                            <span className={"mr-3 text-blue-500"}>
                                                                <FontAwesomeIcon 
                                                                    icon={faFolder}
                                                                />
                                                            </span>
                                                            <span>
                                                                {name}
                                                            </span>
                                                            <div className="absolute z-10 bottom-0 left-0 animate-spin">
                                                                <UpdatingAddonIcon
                                                                    style={{fontSize: "12px"}}
                                                                />
                                                            </div>
                                                        </>
                                                    default:
                                                        return <>
                                                            <span className={"mr-3 " + (mod ? "text-indigo-500" : "text-green-500")}>
                                                                <FontAwesomeIcon 
                                                                    icon={faFolder}
                                                                />
                                                            </span>
                                                        </>
                                                }
                                            })(state, isAMod)}
                                            name={name}
                                            status={((addonState: typeof state) => {
                                                switch (addonState) {
                                                    case "update-aborted":
                                                    case "update-failed":
                                                        return <span className="text-red-500">{"Failed"}</span>
                                                    case "updating":
                                                        return <span className="text-blue-500">{"Updating"}</span>
                                                    default:
                                                        return <span>{"Saved"}</span>
                                                }
                                            })(state)}
                                            type={isAMod ? "mod" : "extension"}
                                            updatedAt={updatedAt}
                                            byteCount={bytes}
                                            showModifiedOnSmallScreen
                                        />
                                    })}
                                    <div className="sm:hidden h-8" />
                                </div>
                            </>}
                        </div>
                    </div>
                    
                </div>
            </div>
        </>}
    </FullScreenLoadingOverlay>
}

export default AddOns