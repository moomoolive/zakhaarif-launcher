import {useState, useEffect, useMemo} from "react"
import {Collapse, Tooltip} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faScaleBalanced,
    faLink,
    faCodeCommit,
    faCopy,
    faEnvelope,
    faGlobe,
    faArrowLeft,
    faLockOpen,
    faFile,
    faCode,
    faGlobeAfrica,
    faCamera,
    faMicrophone,
    faDisplay,
    faVideo,
    faArrowPointer,
    faLocationDot,
    faFloppyDisk
} from "@fortawesome/free-solid-svg-icons"
import {Divider, ClickAwayListener, IconButton} from "@mui/material"
import {Cargo} from "../../lib/cargo/index"
import {NULL_FIELD as CARGO_NULL_FIELD} from "../../lib/cargo/index"
import {CargoIcon} from "../../components/cargo/Icon"
import {isStandardCargo} from "../../lib/utils/cargos"
import {CargoIndex} from "../../lib/shabah/downloadClient"
import {reactiveDate} from "../../lib/utils/dates"
import {MOD_CARGO_TAG, EXTENSION_CARGO_TAG} from "../../config"
import {Permissions, permissionsMeta, ALLOW_ALL_PERMISSIONS} from "../../lib/types/permissions"
import { cleanPermissions } from "../../lib/utils/security/permissionsSummary"
import { readableByteCount } from "../../lib/utils/storage/friendlyBytes"
import { useCloseOnEscape } from "../../hooks/closeOnEscape"

type PermissionsArray = Cargo<Permissions>["permissions"]

type PermissionsIconProps = {
    permission: PermissionsArray[number]
}

// taken from https://stackoverflow.com/questions/7225407/convert-camelcasetext-to-title-case-text
const camelCaseToTitleCase = (text: string) => {
    const result = text.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1)
}

const defaultPermission = (key: PermissionsArray[number]["key"]) => {
    switch (key) {
        case "geoLocation":
            return <span className="text-yellow-500">
                <FontAwesomeIcon icon={faLocationDot}/>
            </span>
        case "unlimitedStorage":
            return <span className="text-green-500">
                <FontAwesomeIcon icon={faLockOpen}/>
            </span>
        case "camera":
            return <span className="text-yellow-500">
                <FontAwesomeIcon icon={faCamera}/>
            </span>
        case "microphone":
            return <span className="text-yellow-500">
                <FontAwesomeIcon icon={faMicrophone}/>
            </span>
        case "fullScreen":
            return <span className="text-green-500">
                <FontAwesomeIcon icon={faDisplay}/>
            </span>
        case ALLOW_ALL_PERMISSIONS:
            return <span className="text-red-500">
                <FontAwesomeIcon icon={faLockOpen}/>
            </span>
        case "files":
            return <span className="text-green-500">
                <FontAwesomeIcon icon={faFile}/>
            </span>
        case "displayCapture":
            return <span className="text-yellow-500">
                <FontAwesomeIcon icon={faVideo}/>
            </span>
        case "pointerLock":
            return <span className="text-green-500">
                <FontAwesomeIcon icon={faArrowPointer}/>
            </span>
        default:
            return <></>
    }
}

const PermissionsDisplay = ({permission} : PermissionsIconProps) => {
    const [showDetails, setShowDetails] = useState(false)
    
    return <div className="text-sm">
        {((p: typeof permission) => {
            switch (p.key) {
                case "webRequest": {
                    if ((permission.value as string[]).includes(ALLOW_ALL_PERMISSIONS)) {
                        return <>
                            <span className="text-red-500 mr-2.5">
                                <FontAwesomeIcon icon={faGlobeAfrica}/>
                            </span>
                            {`Unrestricted Network Access`}
                        </>
                    }
                    return <>
                        <div>
                            <span className="text-yellow-500 mr-2.5">
                                <FontAwesomeIcon icon={faGlobeAfrica}/>
                            </span>
                            {`Network Access`}
                            <button 
                                className="text-xs ml-2 text-blue-500 hover:text-green-500"
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                {showDetails ? "less" : "more"}
                            </button>
                        </div>
                        {showDetails ? <div
                            className="animate-fade-in-left mb-2"
                        >
                            <div className="mt-1 text-xs text-neutral-400 ml-2">
                                {"Send and recieve data from:"}
                            </div>

                            {permission.value.map((value, index) => {
                                return <div
                                    key={`permission-${permission.key}-detail-${index}`}
                                    className="ml-2"
                                >
                                    <span className="mr-1 text-yellow-400">{`${index + 1}.`}</span>
                                    {value}
                                </div>
                            })}
                        </div> : <></>}
                    </>
                }
                case "embedExtensions": {
                    if ((permission.value as string[]).includes(ALLOW_ALL_PERMISSIONS)) {
                        return <>
                            <span className="text-red-500 mr-2.5">
                                <FontAwesomeIcon icon={faCode}/>
                            </span>
                            {`Embed Any Extension`}
                        </>
                    }
                    return <>
                        <div>
                            <span className="text-red-500 mr-2.5">
                                <FontAwesomeIcon icon={faCode}/>
                            </span>
                            {`Embed Extensions`}
                            <button 
                                className="text-xs ml-2 text-blue-500 hover:text-green-500"
                                onClick={() => setShowDetails(!showDetails)}
                            >
                                {showDetails ? "less" : "more"}
                            </button>
                        </div>
                        {showDetails ? <div
                            className="animate-fade-in-left mb-2"
                        >
                            <div className="mt-1 text-xs text-neutral-400 ml-2">
                                {"Embed one or all of the following:"}
                            </div>

                            {permission.value.map((value, index) => {
                                return <div
                                    key={`permission-${permission.key}-detail-${index}`}
                                    className="ml-2"
                                >
                                    <span className="mr-1 text-yellow-400">{`${index + 1}.`}</span>
                                    {value}
                                </div>
                            })}
                        </div> : <></>}
                    </>
                }
                case "gameSaves":
                    return <>
                        <span className="text-green-500 mr-2">
                            <FontAwesomeIcon icon={faFloppyDisk}/>
                        </span>
                        {`${p.value.includes("write") ? "Read & Edit" : "Read"} Game Saves`}
                    </>
                default:
                    return <>
                        <span className="mr-2">
                            {defaultPermission(p.key)}
                        </span>
                        {permissionsMeta[p.key].name || camelCaseToTitleCase(p.key)}
                    </>
            }
        })(permission)}
    </div>
}

export type CargoSummaryProps = {
    cargo: Cargo<Permissions>
    cargoIndex: CargoIndex
    showModificationMetadata?: boolean
    showImportLinkCopy?: boolean
}

const SHRUNK_DESCRIPTION_CHARACTER_COUNT = 150

export const CargoSummary = ({
    cargo,
    cargoIndex,
    showModificationMetadata = false,
    showImportLinkCopy = false
}: CargoSummaryProps): JSX.Element => {
    const {resolvedUrl, updatedAt, bytes} = cargoIndex 
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
        authors,
        crateLogoUrl,
        permissions,
    } = cargo

    const noLicense = license === CARGO_NULL_FIELD
    const fileCount = files.length
    const friendlyBytes = readableByteCount(bytes)

    const [copiedId, setCopiedId] = useState("none")
    const [expandText, setExpandText] = useState(false)

    const textToClipboard = (text: string, sectionId: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(sectionId)
        window.setTimeout(() => {
            setCopiedId("none")
        }, 1_000)
    }

    const standardKeywords = useMemo(() => {
        const tag = cargoIndex.tag
        const keywords = []
        if (isStandardCargo(cargoIndex)) {
            keywords.push({text: "core", type: "std"})
        }
        if (tag.startsWith(MOD_CARGO_TAG)) {
            keywords.push({text: "mod", type: "mod"})
        }
        if (tag.startsWith(EXTENSION_CARGO_TAG)) {
            keywords.push({text: "extension", type: "ext"})
        }
        return keywords
    }, [cargo])

    const permissionsFiltered = useMemo(() => {
        const allowAll = permissions.some((permission) => permission.key === ALLOW_ALL_PERMISSIONS)
        if (allowAll) {
            return [{key: ALLOW_ALL_PERMISSIONS, value: [] as string[]}] as typeof permissions
        }

        const preFiltered = cleanPermissions(permissions).filter(
            ({key}) => !permissionsMeta[key].implicit
        )
        const extendableDangerousPermissions = preFiltered.filter(
            ({key}) => permissionsMeta[key].dangerous && permissionsMeta[key].extendable
        )
        const dangerousPermissions = preFiltered.filter(
            ({key}) => permissionsMeta[key].dangerous && !permissionsMeta[key].extendable
        )
        const safePermissions = preFiltered.filter(
            ({key}) => !permissionsMeta[key].dangerous
        )
        return [
            ...extendableDangerousPermissions, 
            ...dangerousPermissions, 
            ...safePermissions
        ]
    }, [cargo])

    const hasFooter = (
        homepageUrl !== CARGO_NULL_FIELD 
        || repo.url !== CARGO_NULL_FIELD
    )

    return <div className="w-full">
        <div className="w-full pl-3">
            <div className="flex justify-start pb-3">
                <CargoIcon 
                    importUrl={resolvedUrl}
                    crateLogoUrl={crateLogoUrl}
                    pixels={80}
                    className="mr-4 animate-fade-in-left"
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
                </div>
            </div>

            <div className="overflow-y-scroll py-2 h-48 md:h-60 lg:h-72 w-full">
                <div>
                    {description.length <= SHRUNK_DESCRIPTION_CHARACTER_COUNT
                        ? <>{description}</>
                        : <>
                            {expandText ? <Collapse in={true}>
                                <span className="mr-1">
                                    {description}
                                </span>
                                <button 
                                    className={"text-red-500 text-sm hover:text-red-400"}
                                    onClick={() => setExpandText(false)}
                                >
                                    {"less"}
                                </button>
                            </Collapse> : <>
                                <span className="mr-1">
                                    {`${description.slice(0, SHRUNK_DESCRIPTION_CHARACTER_COUNT)}...`}
                                </span>
                                <button 
                                    className={"text-blue-500 text-sm hover:text-blue-400"}
                                    onClick={() => setExpandText(true)}
                                >
                                    {"more"}
                                </button>
                            </>}
                        </>
                    }
                    
                </div>
                <div className="mt-3 mb-1">
                    <Divider className=" bg-neutral-700"/>
                </div>

                {showModificationMetadata ? <>
                    <div className="text-xs text-neutral-400">
                        {"Updated: " + reactiveDate(new Date(updatedAt))}
                    </div>
                </> : <></>}
                

                <div className="text-sm text-neutral-400 my-3">
                    <div>
                        {showImportLinkCopy ? <>
                            <a 
                                className="hover:text-green-500 mr-4 cursor-pointer"
                                onClick={() => textToClipboard(resolvedUrl, "import-url")}
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
                        </> : <></>}
                    </div>
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

                    <div className="mb-2 w-full">
                        <div className="text-neutral-500 text-xs">
                            {`Permissions:`}
                        </div>
                        
                            {permissions.length < 1 ? <div className="text-sm">
                                none
                            </div> : <>
                                <div className="w-full px-1">
                                    {permissionsFiltered.map((permission, index) => {
                                        return <PermissionsDisplay 
                                            key={`permission-${index}`}
                                            permission={permission}
                                        />
                                    })}
                                </div>
                            </>}
                    </div>

                    <div className="text-xs mb-1">
                        <div className="text-neutral-500 text-xs">
                            {`Metadata:`}
                        </div>
                        <div className="text-sm mb-1">
                            <div>
                                {`${fileCount} file${fileCount > 1 ? "s" : ""}`}
                                <span className="ml-1 text-neutral-500 text-xs">
                                    {`(${friendlyBytes.count} ${friendlyBytes.metric})`}
                                </span>
                            </div>

                            <div>
                                {`schema v${crateVersion}`}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className={`pt-3 ${!hasFooter ? "mb-1" : ""}`}>
            {keywords.length > 0 || standardKeywords.length > 0 ? <>
                <div className="flex w-full px-3 items-center justify-start flex-wrap">
                    {standardKeywords.map(({text: keyword, type}, index) => {
                        return <div
                            key={`keyword-${index}`}
                            className={`mr-2 mb-2 text-xs rounded-full py-1 px-2 ${
                                type === "std" 
                                    ? "bg-blue-500 hover:bg-blue-600" 
                                    : type === "mod" ? "bg-indigo-700 hover:bg-indigo-600" : "bg-green-700 hover:bg-green-600"
                            }`}
                        >
                            {keyword}
                        </div>
                    })}
                    
                    {keywords.slice(0, 5).map((keyword, index) => {
                        return <div
                            key={`keyword-${index}`}
                            className={`mr-2 mb-2 text-xs rounded-full py-1 px-2 bg-neutral-700 hover:bg-neutral-600`}
                        >
                            {keyword}
                        </div>
                    })}
                </div>
            </> : <></>}

            {hasFooter ? <>
                <div className="text-sm py-1 px-3">
                    {homepageUrl !== CARGO_NULL_FIELD ? <>
                        <a 
                            href={homepageUrl} 
                            target="_blank" 
                            rel="noopener"
                            className="hover:text-green-500 mr-4"
                        >
                            <span className="mr-1 text-green-500">
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
                            className=" hover:text-green-500 mr-4"
                        >
                            <span className="text-green-500 mr-1">
                                <FontAwesomeIcon icon={faCodeCommit}/>
                            </span>
                            repo
                        </a>
                    </> : <></>}
                </div>
            </> : <></>}
        </div>
    </div>
}

export type CargoInfoProps = {
    onClose: () => void
    cargo: Cargo<Permissions>
    cargoIndex: CargoIndex
}

export const CargoInfo = ({
    cargo,
    onClose,
    cargoIndex
}: CargoInfoProps): JSX.Element => {

    useCloseOnEscape(onClose)

    return <div className="fixed bg-neutral-900/80 z-20 w-screen h-screen overflow-clip flex items-center justify-center">
        <div className="absolute top-0 left-0">
            <div className="ml-2 mt-2">
                <Tooltip title="Close">
                    <IconButton>
                        <FontAwesomeIcon icon={faArrowLeft}/>
                    </IconButton>
                </Tooltip>
            </div>
        </div>
        
        <ClickAwayListener onClickAway={onClose}>
            <div className="w-5/6 max-w-md py-3 rounded bg-neutral-800 animate-fade-in-left">
                <CargoSummary
                    cargo={cargo}
                    cargoIndex={cargoIndex}
                    showModificationMetadata
                    showImportLinkCopy
                />
            </div>
        </ClickAwayListener>
    </div>
}