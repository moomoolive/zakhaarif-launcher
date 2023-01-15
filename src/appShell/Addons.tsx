import {useState, useMemo, useRef} from "react"
import {useEffectAsync} from "@/hooks/effectAsync"
import {FullScreenLoadingOverlay} from "@/components/LoadingOverlay"
import {ErrorOverlay} from "@/components/ErrorOverlay"
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
    faChevronDown,
    faChevronUp,
    faBoxesStacked,
    faAngleRight,
    faFile,
    faImage,
    faFolderTree,
    faDownload,
    faCircleExclamation,
    faFilm,
    faTrash,
    faBars,
    faInfoCircle,
    faBoxOpen,
    faScaleBalanced,
    faLink,
    faCodeCommit,
    faCopy,
    faEnvelope,
    faBarcode,
    faGlobe,
    faHeading,
    faXmark
} from "@fortawesome/free-solid-svg-icons"
import {
    faJs, 
    faCss3,
    faHtml5,
} from "@fortawesome/free-brands-svg-icons"
import {readableByteCount, toGigabytesString} from "@/lib/utils/storage/friendlyBytes"
import {reactiveDate} from "@/lib/utils/dates"
import {
    Divider, 
    LinearProgress,
    Collapse,
    IconButton,
    ClickAwayListener,
} from "@mui/material"
import {useAppShellContext} from "./store"
import {io} from "@/lib/monads/result"
import {emptyCargoIndices, CargoState} from "@/lib/shabah/backend"
import UpdatingAddonIcon from "@mui/icons-material/Sync"
import FailedAddonIcon from "@mui/icons-material/ReportProblem"
import {useGlobalConfirm} from "@/hooks/globalConfirm"
import {CodeManifestSafe} from "@/lib/cargo/index"
import {urlToMime, Mime} from "@/lib/miniMime/index"
import {BYTES_PER_MB} from "@/lib/utils/consts/storage"
import {APP_CARGO_ID} from "@/config"
import {NULL_FIELD as CARGO_NULL_FIELD} from "@/lib/cargo/consts"

const filterOptions = [
    "updatedAt", "bytes", "state", "addon-type", "name"
] as const

const MOD_CARGO_ID_PREFIX = "mod-"
const EXTENSION_CARGO_ID_PREFIX = "ext-"

const isAMod = (id: string) => id.startsWith(MOD_CARGO_ID_PREFIX)

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

type FilterOrder = "ascending" | "descending"

const filterChevron = (
    currentFilter: string, 
    targetFilter: string,
    order: FilterOrder
) => {
    if (currentFilter !== targetFilter) {
        return <></>
    } else if (order === "descending") {
        return <span className={`ml-1 lg:ml-2 text-blue-500`}>
            <FontAwesomeIcon 
                icon={faChevronUp}
            />
        </span>
    } else {
        return <span className={`ml-1 lg:ml-2 text-blue-500`}>
            <FontAwesomeIcon 
                icon={faChevronDown}
            />
        </span>
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

const mimeToIcon = (mime: Mime, classes: string) => {
    if (mime.startsWith("image/")) {
        return <span className={`${classes} text-indigo-500`}>
            <FontAwesomeIcon 
                icon={faImage}
            />
        </span>
    }
    if (mime.startsWith("video/")) {
        return <span className={`${classes} text-red-500`}>
            <FontAwesomeIcon 
                icon={faFilm}
            />
        </span>
    }
    switch (mime) {
        case "application/wasm":
            return <span className={`${classes}`}>
                <img
                    src="logos/webassembly.svg"
                    width="16px"
                    height="16px"
                    className="inline-block"
                />
            </span>
        case "text/html":
            return <span className={`${classes} text-orange-500`}>
                <FontAwesomeIcon 
                    icon={faHtml5}
                />
            </span>
        case "application/json":
            return <span className={`${classes} text-yellow-500`}>
                {"{ }"}
            </span>
        case "text/javascript":
            return <span className={`${classes} text-yellow-500`}>
                <FontAwesomeIcon 
                    icon={faJs}
                />
            </span>
        case "text/css":
            return <span className={`${classes} text-blue-600`}>
                <FontAwesomeIcon 
                    icon={faCss3}
                />
            </span>
        default:
            return <span className={`${classes}`}>
                <FontAwesomeIcon 
                    icon={faFile}
                />
            </span>
    }
}

type FileOverlayProps = {
    name: string
    mime: Mime
    url: string
    fileResponse: Response,
    bytes: number
    onClose: () => void
}

const FileOverlay = ({
    name, 
    mime, 
    fileResponse, 
    url, 
    onClose,
    bytes
}: FileOverlayProps) => {
    const [fileText, setFileText] = useState("")
    const [showHeaders, setShowHeaders] = useState(false)
    const consumedResponse = useRef(false)

    const contentType = showHeaders
        ? "headers"
        : mime

    useEffectAsync(async () => {
        if (
            consumedResponse.current
            || mime.startsWith("image/")
            || mime.startsWith("video/")
        ) {
            return
        }
        const textResponse = await io.wrap(fileResponse.text())
        consumedResponse.current = true
        if (!textResponse.ok) {
            return
        }
        setFileText(textResponse.data)
    }, [])
    
    return <>
        <div className="fixed bg-neutral-900/80 z-20 w-screen h-screen overflow-clip flex items-center justify-center">
            <div className="absolute z-30 top-1 left-1 w-full flex">
                <div className="w-1/2 overflow-x-clip text-ellipsis whitespace-nowrap">
                    <Tooltip title="Back">
                        <IconButton
                            onClick={onClose}
                        >
                            <span className="text-xl">
                                <FontAwesomeIcon 
                                    icon={faArrowLeft}
                                />
                            </span>
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={name}>
                        <span className="ml-3">
                            {mimeToIcon(mime, "mr-3")}
                            {name}
                        </span>
                    </Tooltip>
                </div>
                <div className="w-1/2 text-right text-sm">
                    <span className="mr-3">
                        <Tooltip title="Response Headers">
                            <IconButton 
                                size="small"
                                className="hover:text-green-500"
                                onClick={() => setShowHeaders(true)}
                            >
                                <FontAwesomeIcon 
                                    icon={faHeading}
                                />
                            </IconButton>
                        </Tooltip>
                    </span>

                    <span className="mr-3">
                        <Tooltip title="Download">
                            <a download={name} href={url}>
                                <IconButton 
                                    size="small"
                                    className="hover:text-green-500"
                                >
                                    <FontAwesomeIcon 
                                        icon={faDownload}
                                    />
                                </IconButton>
                            </a>
                        </Tooltip>
                    </span>
                </div>
            </div>

            <div className="w-5/6 max-w-xl">
                {((content: typeof contentType, url: string) => {
                    if (content === "headers") {
                        return <div
                            className="px-4 pb-4 pt-2 w-full bg-neutral-800 rounded"
                        >
                            <div className="text-right pb-2">
                                <Tooltip title="Close">
                                    <IconButton 
                                        size="small"
                                        className="hover:text-red-500"
                                        onClick={() => setShowHeaders(false)}
                                    >
                                        <FontAwesomeIcon
                                            icon={faXmark}
                                        />
                                    </IconButton>
                                </Tooltip>
                            </div>

                            <div
                                className="overflow-y-scroll overflow-x-clip break-words"
                                style={{maxHeight: "230px"}}
                            >
                                <div className={`text-sm ${fileResponse.status > 399 ? "text-red-500" : "text-green-500"} mb-1`}>
                                    <span className="text-neutral-400">
                                        {"request url:"}
                                    </span>
                                    
                                    <span className="ml-1">
                                        {url}
                                    </span>
                                </div>
                                
                                <div className={`text-sm ${fileResponse.status > 399 ? "text-red-500" : "text-green-500"} mb-1`}>
                                    <span className="text-neutral-400">
                                        {"status:"}
                                    </span>
                                    
                                    <span className="ml-1">
                                        {fileResponse.status}
                                    </span>
                                    <span className="ml-1">
                                        {`(${fileResponse.statusText})`}
                                    </span>
                                </div>

                                <div className="my-2">
                                    <Divider/>
                                </div>

                                {((headers: Headers) => {
                                    const values = [] as {key: string, value: string}[]
                                    for (const [key, value] of headers.entries()) {
                                        values.push({key, value})
                                    }
                                    return values
                                })(fileResponse.headers).map((header, index) => {
                                    const {key, value} = header
                                    return <div
                                        key={`file-header-${index}`}
                                        className="text-sm mb-1"
                                    >
                                        <span className="text-neutral-400">
                                            {`${key}: `}
                                        </span>
                                        <span className="text-neutral-100">
                                            {value}
                                        </span>
                                    </div>
                                })}
                            </div>
                            
                        </div>
                    } else if (content.startsWith("image/")) {
                        return <img 
                            src={url}
                            className="w-full"
                            crossOrigin=""
                        />
                    } else if (content.startsWith("video/")) {
                        return <video
                            controls
                            crossOrigin=""
                            src={url}
                            className="w-full"
                        />
                    } else if (bytes < BYTES_PER_MB * 3) {
                        return <div 
                            className="p-4 w-full overflow-scroll bg-neutral-800 rounded whitespace-pre-wrap flex"
                            style={{maxHeight: "96rem"}}
                        >
                            <div>
                                {fileText}
                            </div>
                        </div>
                    } else {
                        return <div
                            className="p-4 w-full text-center"
                        >
                            <span className="mr-2 text-yellow-500">
                                <FontAwesomeIcon
                                    icon={faCircleExclamation}
                                />
                            </span>
                            File is too large. Download to view.
                        </div>
                    }
                })(contentType, url)}
            </div>
        </div>
    </>
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
}

const AddonListItem = ({
    onClick, 
    icon, 
    name,
    type,
    updatedAt,
    byteCount,
    typeTooltip = false,
    status = null
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
                <div className="w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
                    {type}
                </div>
            </Tooltip>
        </> : <>
            <div className="w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
                {type}
            </div>
        </>}
        
        <div className="hidden md:block w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
            {reactiveDate(new Date(updatedAt))}
        </div>
        
        <div className="w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
            {`${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`}
        </div>
    </button>
}

type CargoIconProps = {
    importUrl: string
    pixels: number
    crateLogoUrl: string
    className?: string
}

const CargoIcon = ({crateLogoUrl, importUrl, pixels, className = ""}: CargoIconProps) => {
    const cssPixels = `${pixels}px`
    return crateLogoUrl === "" || crateLogoUrl === CARGO_NULL_FIELD
        ?   <div 
                className={"flex items-center justify-center rounded-2xl bg-neutral-900 shadow-lg " + className}
                style={{minWidth: cssPixels, height: cssPixels}}
            >
                <div 
                    className="text-blue-500" 
                    style={{fontSize: `${Math.trunc(pixels / 2)}px`}}
                >
                    <FontAwesomeIcon
                        icon={faBoxOpen}
                    />
                </div>
            </div>
        :   <div className={className}>
                <img 
                    src={`${importUrl}${crateLogoUrl}`}
                    className="rounded-2xl bg-neutral-900 shadow-lg"
                    style={{minWidth: cssPixels, height: cssPixels}}
                />
            </div>
}

type CargoInfoProps = {
    onClose: () => void
    cargo: CodeManifestSafe
    importUrl: string
}

const CargoInfo = ({
    importUrl,
    cargo,
    onClose
}: CargoInfoProps) => {
    const {
        name, 
        keywords, 
        version, 
        license, 
        description,
        files,
        crateVersion,
        homepageUrl,
        repo,
        uuid,
        authors,
        crateLogoUrl
    } = cargo

    const noLicense = license === CARGO_NULL_FIELD
    const fileCount = files.length

    const [copiedId, setCopiedId] = useState("none")

    const textToClipboard = (text: string, sectionId: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(sectionId)
        window.setTimeout(() => {
            setCopiedId("none")
        }, 1_000)
    }
    console.log(crateLogoUrl)

    return <div className="fixed bg-neutral-900/80 z-20 w-screen h-screen overflow-clip flex items-center justify-center">
        <ClickAwayListener onClickAway={onClose}>
        <div className="w-5/6 max-w-xl py-3 rounded bg-neutral-800">
            <div className="w-full pl-3">
                <div className="flex justify-start pb-3">
                    <CargoIcon 
                        importUrl={importUrl}
                        crateLogoUrl={crateLogoUrl}
                        pixels={80}
                        className="mr-4 animate-fade-in"
                    />

                    <div className="mt-1 w-3/4">
                        <Tooltip title={name}>
                            <div className="text-xl overflow-x-clip whitespace-nowrap text-ellipsis">
                                {name}
                            </div>
                        </Tooltip>
                        <div className="text-xs mb-0.5 text-neutral-400">
                            {`v${version}`}
                        </div>
                        <div className="text-xs mb-0.5 text-neutral-400">
                            <span className={`mr-1 ${noLicense ? "" : "text-green-500"}`}>
                                <FontAwesomeIcon icon={faScaleBalanced}/>
                            </span>
                            {noLicense ? "no license" : license}
                        </div>
                        <div className="text-xs text-neutral-400">
                            
                        </div>
                    </div>
                </div>

                <div className="overflow-y-scroll py-2 h-48 md:h-60 lg:h-72 w-full">
                    <div>
                        {description}
                    </div>
                    <div className="my-3">
                        <Divider className=" bg-neutral-700"/>
                    </div>
                    <div className="text-neutral-300">
                        {authors.length > 0 ? <>
                            <div className="mb-2">
                                <div className="text-xs text-neutral-500">
                                    {`Author${authors.length > 1 ? "s" : ""}:`}
                                </div>
                                {authors.map((author, index) => {
                                    const {name, email, url} = author
                                    return <div
                                        key={`cargo-author-${index}`}
                                        className="text-sm"
                                    >
                                        {email !== CARGO_NULL_FIELD ? <a
                                            href={`mailto:${email}`}
                                            className="hover:text-green-500 text-neutral-400 cursor-pointer"
                                        >
                                            <span
                                                className="mr-2"
                                            >
                                                <FontAwesomeIcon icon={faEnvelope} />
                                            </span>
                                        </a> : <></>}
                                        {url !== CARGO_NULL_FIELD ? <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener"
                                            className="hover:text-green-500 cursor-pointer text-neutral-400"
                                        >
                                            <span
                                                className="mr-2"
                                            >
                                                <FontAwesomeIcon icon={faLink} />
                                            </span>
                                        </a> : <></>}
                                        <span>
                                            {name}
                                        </span>
                                    </div>
                                })}
                            </div>
                        </> : <></>}

                        <div className="mb-2">
                            <div className="text-neutral-500 text-xs">
                                {`Permissions:`}
                            </div>
                            <div className="text-sm">
                                none
                            </div>
                        </div>

                        <div className="text-xs mb-2">
                            <div className="text-neutral-500 text-xs">
                                {`Metadata:`}
                            </div>
                            <div className="text-sm">
                                <span className="mr-1">
                                    {fileCount}
                                </span>
                                <span>
                                    files
                                </span>
                                <span className="ml-3">
                                    {`crate v${crateVersion}`}
                                </span>
                            </div>
                        </div>

                        <div className="text-sm text-neutral-400 mt-4">
                            <div className="mb-2">
                                <a 
                                    className="hover:text-green-500 mr-4 cursor-pointer"
                                    onClick={() => textToClipboard(uuid, "cargo-id")}
                                >
                                    {copiedId === "cargo-id" ? <>
                                        <span className="mr-2">
                                            <FontAwesomeIcon icon={faCopy}/>
                                        </span>
                                        {"Copied!"}
                                    </> : <>
                                        <span className="mr-2">
                                            <FontAwesomeIcon icon={faBarcode}/>
                                        </span>
                                        {"Copy Add-on Id"}
                                    </>}
                                </a>
                            </div>
                            
                            <div>
                                <a 
                                    className="hover:text-green-500 mr-4 cursor-pointer"
                                    onClick={() => textToClipboard(importUrl, "import-url")}
                                >
                                    {copiedId === "import-url" ? <>
                                        <span className="mr-2">
                                            <FontAwesomeIcon icon={faCopy}/>
                                        </span>
                                        {"Copied!"}
                                    </> : <>
                                        <span className="mr-1">
                                            <FontAwesomeIcon icon={faLink}/>
                                        </span>
                                        {"Copy Import Url"}
                                    </>}
                                </a>
                            </div>
                        </div>
                    </div>

                    
                </div>
            </div>

            <div className="pt-3">
                {keywords.length > 0 ? <>
                    <div className="flex w-full px-3 items-center justify-start flex-wrap">
                        {keywords.map((keyword, index) => {
                            return <div
                                key={`keyword-${index}`}
                                className="mr-2 mb-2 text-xs rounded-full bg-neutral-700 py-1 px-2 hover:bg-neutral-600"
                            >
                                {keyword}
                            </div>
                        })}
                    </div>
                </> : <></>}

                {homepageUrl !== CARGO_NULL_FIELD || repo.url !== CARGO_NULL_FIELD ? <>
                    <div className="text-sm py-1 px-3">
                        {homepageUrl !== CARGO_NULL_FIELD ? <>
                            <a 
                                href={homepageUrl} 
                                target="_blank" 
                                rel="noopener"
                                className="hover:text-green-500 mr-4"
                            >
                                <span className="mr-1">
                                    <FontAwesomeIcon icon={faGlobe}/>
                                </span>
                                website
                            </a>
                        </> : <></>}

                        {repo.url !== CARGO_NULL_FIELD ? <>
                            <a 
                                href={homepageUrl} 
                                target="_blank" 
                                rel="noopener"
                                className="hover:text-green-500 mr-4"
                            >
                                <span className="mr-1">
                                    <FontAwesomeIcon icon={faCodeCommit}/>
                                </span>
                                repo
                            </a>
                        </> : <></>}
                    </div>
                </> : <></>}
            </div>
        </div>
        </ClickAwayListener>
    </div>
}

const ROOT_DIRECTORY_PATH = "#"

const AddOns = () => {
    const {downloadClient} = useAppShellContext()
    const [searchParams, setSearchParams] = useSearchParams()
    const confirm = useGlobalConfirm()
    const navigate = useNavigate()
    
    const [
        loadingInitialData, 
        setLoadingInitialData
    ] = useState(true)
    const [isInErrorState, setIsInErrorState] = useState(false)
    const [cargoIndex, setCargoIndex] = useState(
        emptyCargoIndices()
    )
    const [storageUsage, setStorageUsage] = useState({
        used: 0, total: 0, left: 0
    })
    const [searchText, setSearchText] = useState("")
    const [filter, setFilter] = useState<typeof filterOptions[number]>("updatedAt")
    const [order, setOrder] = useState<FilterOrder>("descending")
    const [viewingCargo, setViewingCargo] = useState("none")
    const [targetCargo, setTargetCargo] = useState(
        new CodeManifestSafe()
    )
    const [cargoFound, setCargoFound] = useState(false)
    const [viewingCargoIndex, setViewingCargoIndex] = useState(0)
    const [directoryPath, setDirectoryPath] = useState(
        [] as CargoDirectory[]
    )
    const [showFileOverlay, setShowFileOverlay] = useState(false)
    const [fileDetails, setFileDetails] = useState({
        name: "",
        mime: "text/javascript" as Mime,
        url: "",
        fileResponse: new Response("", {status: 200}),
        bytes: 0
    })
    const [
        cargoOptionsElement, 
        setCargoOptionsElement
    ] = useState<null | HTMLButtonElement>(null)
    const [
        allCargosOptionsElement,
        setAllCargosOptionsElement
    ] = useState<null | HTMLButtonElement>(null)
    const [
        mobileMainMenuElement,
        setMobileMainMenuElement,
    ] = useState<null | HTMLButtonElement>(null)
    const [
        showCargoInfo,
        setShowCargoInfo
    ] = useState(false)
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
            targetCargoIndex.storageRootUrl
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
        setTargetCargo(new CodeManifestSafe(cargoTarget))
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
        const data = cargoIndexRes.data 
        const first = data.cargos.length < 1 
            ? {name: "string",
                id: "string",
                storageRootUrl: "string",
                requestRootUrl: "string",
                bytes: 0,
                entry: "string",
                version: "string",
                state: "cached",
                createdAt: 0,
                updatedAt: 0,} as const
            : data.cargos[0]
        const copy = {...first}
        const cargos = [
            copy,
            {   
                ...copy, 
                id: `${MOD_CARGO_ID_PREFIX}-${~~(Math.random() * 1_000_000)}`,
                name: `std-${~~(Math.random() * 1_000_000)}`,
                state: "updating" as const
            },
            {   
                ...copy, 
                id: `${EXTENSION_CARGO_ID_PREFIX}${~~(Math.random() * 1_000_000)}`,
                name: `std${~~(Math.random() * 1_000_000)}`,
                state: "update-aborted" as const
            },
        ]
        for (let i = 0; i < 100; i++) {
            const idPrefix = (i % 2 === 0) 
                ? MOD_CARGO_ID_PREFIX 
                : EXTENSION_CARGO_ID_PREFIX
            cargos.push({   
                ...copy, 
                id: `${idPrefix}${~~(Math.random() * 1_000_000)}`,
                name: `${idPrefix}${~~(Math.random() * 1_000_000)}`,
                updatedAt: copy.updatedAt - ~~(Math.random() * 1_000_000_000),
                bytes: ~~(Math.random() * 100_000_000),
                state: i % 7 === 0 ? "archived" : "cached"
            })
        }
        setCargoIndex({...cargoIndexRes.data, cargos})
        setStorageUsage(clientStorageRes.data)
    }, [])

    const filteredCargos = useMemo(() => {
        if (isViewingCargo) {
            return cargoIndex.cargos
        }
        const orderFactor = order === "ascending" ? 1 : -1
        const copy = []
        const getArchives = searchParams.has("archive")
        for (let i = 0; i < cargoIndex.cargos.length; i++) {
            const targetCargo = cargoIndex.cargos[i]
            if (
                (getArchives && targetCargo.state !== "archived")
                || (!getArchives && targetCargo.state === "archived") 
                || !targetCargo.name.includes(searchText)
            ) {
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
                    const order = isAMod(a.id) && !isAMod(b.id)
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

    const onNewPackage = () => {
        console.info("new pkg")
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
                        importUrl={
                            viewingCargoIndex > (cargoIndex.cargos.length - 1) || viewingCargoIndex < 0
                                ? ""
                                : cargoIndex.cargos[viewingCargoIndex].requestRootUrl
                        }
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
                        <div className="w-full mb-3 sm:mb-0 sm:w-3/5 sm:ml-1.5">
                            <TextField
                                fullWidth
                                size="small"
                                id="add-ons-search-bar"
                                name="search-bar"
                                className="rounded"
                                placeholder={`Search for ${isViewingCargo && cargoFound ? "file, folders" : "add-on"}...`}
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
                
                <div className="w-full relative z-0 h-10/12 sm:h-11/12 flex items-center justify-center">
                    <Divider className="bg-neutral-200"/>

                    <div className="absolute z-20 bottom-0 right-5 sm:hidden">
                        <Fab
                            disabled
                            onClick={onNewPackage}
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
                                        disabled
                                        onClick={onNewPackage}
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
                                                            importUrl={cargoIndex.cargos[viewingCargoIndex].requestRootUrl}
                                                            crateLogoUrl={targetCargo.crateLogoUrl}
                                                            pixels={17}
                                                            className="animate-fade-in"
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
                                                className="hover:text-yellow-500"
                                                onClick={async () => {
                                                    const target = cargoIndex.cargos[viewingCargoIndex]
                                                    if (target.id === APP_CARGO_ID) {
                                                        confirm({title: `${target.name} cannot be archived!`})
                                                        return 
                                                    }
                                                    if (!await confirm({title: `Are you sure you want to archive ${target.name} add-on?`})) {
                                                        setCargoOptionsElement(null)
                                                        return
                                                    }
                                                    setViewingCargo("none")
                                                    const copy = [...cargoIndex.cargos]
                                                    copy.splice(viewingCargoIndex, 1, {
                                                        ...target,
                                                        state: "archived"
                                                    })
                                                    setCargoIndex({
                                                        ...cargoIndex,
                                                        cargos: copy
                                                    })
                                                    await downloadClient.archiveCargo(target.id)
                                                }}
                                            >
                                                <span className="mr-3">
                                                    <FontAwesomeIcon icon={faBoxArchive} />
                                                </span>
                                                Archive
                                            </MenuItem>

                                            <MenuItem
                                                className="hover:text-red-500"
                                                onClick={async () => {
                                                    const target = cargoIndex.cargos[viewingCargoIndex]
                                                    if (target.id === APP_CARGO_ID) {
                                                        confirm({title: `${target.name} cannot be deleted!`})
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
                                                    await downloadClient.deleteCargo(target.id)
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
                                            {filterChevron(filter, "name", order)}
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
                                            {filterChevron(filter, "bytes", order)}
                                        </button>
                                    </div>
                                </> : <>
                                    <div className="w-1/2 lg:w-1/3">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("name")}
                                        >
                                            Name
                                            {filterChevron(filter, "name", order)}
                                        </button>
                                    </div>
                                    <div className={`hidden lg:block w-1/6 text-center`}>
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("state")}
                                        >
                                            Status
                                            {filterChevron(filter, "state", order)}
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("addon-type")}
                                        >
                                            Type
                                            {filterChevron(filter, "addon-type", order)}
                                        </button>
                                    </div>
                                    <div className="hidden md:block w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("updatedAt")}
                                        >
                                            Modified
                                            {filterChevron(filter, "updatedAt", order)}
                                        </button>
                                    </div>
                                    <div className="w-1/4 md:w-1/6 text-center">
                                        <button
                                            className="hover:bg-gray-900 rounded px-2 py-1"
                                            onClick={() => toggleFilter("bytes")}
                                        >
                                            Size
                                            {filterChevron(filter, "bytes", order)}
                                        </button>
                                    </div>
                                </>}
                                
                            </div>

                            <Divider className="bg-neutral-200"/>


                            {isViewingCargo ? <>
                                <div className="w-full h-5/6 overflow-y-scroll text-center animate-fade-in">
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
                                        <div className="w-full h-5/6 overflow-y-scroll text-center animate-fade-in">
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
                                            {false ? <>
                                                    <Tooltip title="Back To Add-ons" placement="top">
                                                        <div>
                                                            <AddonListItem 
                                                                onClick={() => setViewingCargo("none")}
                                                                icon={<span className={"mr-3 text-amber-300"}>
                                                                <FontAwesomeIcon 
                                                                        icon={faFolderTree}
                                                                    />
                                                                </span>
                                                                }
                                                                name="My Add-ons"
                                                                type="parent folder"
                                                                updatedAt={cargoIndex.updatedAt}
                                                                byteCount={storageUsage.used}
                                                            />
                                                        </div>
                                                    </Tooltip>
                                                </> : <></>}

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
                                                            const basePath = cargoIndex.cargos[viewingCargoIndex].storageRootUrl
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
                                                            const fileResponse = await downloadClient.getCachedFile(fullPath)
                                                            if (fileResponse) {
                                                                setFileDetails({
                                                                    name: file.name,
                                                                    mime,
                                                                    url: fullPath,
                                                                    fileResponse,
                                                                    bytes: file.bytes,
                                                                })
                                                                setShowFileOverlay(true)
                                                            }
                                                        }}
                                                        icon={mimeToIcon(mime, "mr-3")}
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
                                <div className="w-full h-5/6 overflow-y-scroll animate-fade-in">
                                    {filteredCargos.map((cargo, index) => {
                                        const {name, bytes, updatedAt, id, state} = cargo
                                        
                                        const isMod = isAMod(id)
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
                                            })(state, isMod)}
                                            name={name}
                                            status={((addonState: typeof state) => {
                                                switch (addonState) {
                                                    case "update-aborted":
                                                    case "update-failed":
                                                        return <span className="text-red-500">{"Failed"}</span>
                                                    case "updating":
                                                        return <span className="text-blue-500">{"Updating"}</span>
                                                    case "archived":
                                                        return <span>{"Archived"}</span>
                                                    default:
                                                        return <span>{"Saved"}</span>
                                                }
                                            })(state)}
                                            type={isMod ? "mod" : "extension"}
                                            updatedAt={updatedAt}
                                            byteCount={bytes}
                                        />
                                    })}
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