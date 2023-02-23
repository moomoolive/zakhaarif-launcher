import {useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
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
import {HuzmaManifest} from "huzma"
import {Permissions, permissionsMeta, ALLOW_ALL_PERMISSIONS} from "../../lib/types/permissions"

type PermissionsArray = HuzmaManifest<Permissions>["permissions"]

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

export const PermissionsDisplay = ({permission} : PermissionsIconProps) => {
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