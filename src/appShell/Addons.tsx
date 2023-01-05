import {Shabah} from "@/lib/shabah/wrapper"
import {APP_CACHE} from "@/config"
import {webAdaptors} from "@/lib/shabah/adaptors/web-preset"
import {useRef, useState} from "react"
import {usePromise} from "@/hooks/promise"
import {FullScreenLoadingOverlay} from "@/components/loadingOverlay"
import {ErrorOverlay} from "@/components/errorOverlay"
import { Button } from "@mui/material"
import {useNavigate} from "react-router-dom"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faFolder, 
    faPuzzlePiece, 
    faHardDrive,
    faSignal,
} from "@fortawesome/free-solid-svg-icons"
import {readableByteCount, toGigabytesString} from "@/lib/utils/storage/friendlyBytes"
import {reactiveDate} from "@/lib/utils/dates"
import {Divider, LinearProgress} from "@mui/material"

const AddOns = () => {
    const navigate = useNavigate()

    const {current: downloadClient} = useRef(new Shabah({
        origin: location.origin,
        ...webAdaptors(APP_CACHE)
    }))
    const [currentPath] = useState("")
    const cargoIndex = usePromise(downloadClient.getCargoIndices())
    const storageUsage = usePromise(downloadClient.getStorageUsage())

    return <FullScreenLoadingOverlay 
        loading={cargoIndex.loading}
        minimumLoadTimeMilliseconds={1_000}
    >
        {!cargoIndex.data.ok ? <ErrorOverlay>
            <div className="text-gray-400 mb-1">
                An error occurred when search for files
            </div>
            <Button onClick={() => navigate("/start")}>
                Back to Home
            </Button>
        </ErrorOverlay> : <>
            <div className="fixed z-0 w-screen h-screen overflow-clip">
                <div className="w-full h-1/12 flex items-center justify-center">
                    
                </div>
                
                <div className="w-full h-11/12 flex items-center justify-center">
                    <Divider className="bg-neutral-400"/>

                    <div className="w-1/5 h-full bg-neutral-700 text-sm">
                        <Divider className="bg-neutral-400"/>

                        <div className="p-4">
                            <span className="mr-2 text-green-500">
                                <FontAwesomeIcon
                                    icon={faPuzzlePiece}
                                />
                            </span>
                            {"Add-On Manager"}
                        </div>

                        <Divider className="bg-neutral-400"/>
                        
                        <div className="p-4 text-base text-gray-300">
                            <div className="mb-4 hover:text-green-500 cursor-pointer">
                                <span className="mr-2">
                                    <FontAwesomeIcon 
                                        icon={faSignal}
                                    />
                                </span>
                                Stats
                            </div>

                            <div>
                                herro world
                            </div>
                        </div>
                        

                        <Divider className="bg-neutral-400"/>

                        <div className="w-3/5 mt-4 ml-4">
                            <LinearProgress 
                                variant="determinate" 
                                value={
                                    storageUsage.loading || !storageUsage.data.ok
                                        ? 3
                                        : Math.max(
                                            3,
                                            storageUsage.data.data.used / storageUsage.data.data.total 
                                        ) 
                                } 
                            />
                        </div>

                        <div className="px-4 pt-4 pb-2 text-xs">
                            <span className="mr-2 text-purple-400">
                                <FontAwesomeIcon
                                    icon={faHardDrive}
                                />
                            </span>
                            {storageUsage.loading ? <span 
                                className="animate-pulse"
                            >
                                {"calculating..."}
                            </span> : <>
                                {storageUsage.data.ok 
                                    ? `${toGigabytesString(storageUsage.data.data.used, 1)} of ${toGigabytesString(storageUsage.data.data.total, 1)}` 
                                    : "unknown"}
                            </>}
                            
                        </div>

                        <div className="text-xs px-4 text-gray-400">
                            1 packages
                        </div>
                    </div>
                    
                    <div className="w-4/5 h-full bg-neutral-600">
                        <Divider className="bg-neutral-400"/>
                        
                        <div className="w-11/12 h-full">
                            
                            
                            <div className="p-4 text-sm bg-neutral-700 text-gray-300">
                                {currentPath.length < 1 ? "All Packages" : currentPath}
                            </div>
                            
                            <Divider className="bg-neutral-400"/>

                            <div className="px-4 py-3 bg-neutral-700 flex justify-center items-center text-sm text-gray-300">
                                <div className="w-1/3">
                                    Name
                                </div>
                                <div className="w-1/6">
                                    Version
                                </div>
                                <div className="w-1/6">
                                    Type
                                </div>
                                <div className="w-1/6">
                                    Modified
                                </div>
                                <div className="w-1/6">
                                    Size
                                </div>
                            </div>

                            <Divider className="bg-neutral-400"/>

                            <div className="w-full bg-neutral-600 h-5/6">
                                {cargoIndex.data.data.cargos.map((cargo, index) => {
                                    const {name, bytes, updatedAt, id, version} = cargo
                                    const friendlyBytes = readableByteCount(bytes)
                                    const isMod = id === "std-pkg"
                                    return <div key={`cargo-index-${index}`}>
                                        <button
                                            
                                            className="p-4 w-full text-left flex justify-center items-center hover:bg-neutral-500"
                                        >
                                            <div className="w-1/3">
                                                <span className={"mr-3 " + (isMod ? "text-blue-500" : "text-green-500")}>
                                                    <FontAwesomeIcon 
                                                        icon={faFolder}
                                                    />
                                                </span>
                                                <span>
                                                    {name}
                                                </span>
                                            </div>

                                            <div className="w-1/6 text-xs text-gray-400">
                                                {version}
                                            </div>

                                            <div className="w-1/6 text-xs text-gray-400">
                                                {isMod ? "mod" : "extension"}
                                            </div>

                                            <div className="w-1/6 text-xs text-gray-400">
                                                {reactiveDate(new Date(updatedAt))}
                                            </div>

                                            <div className="w-1/6 text-xs text-gray-400">
                                                {friendlyBytes.count} {friendlyBytes.metric.toUpperCase()}
                                            </div>
                                        </button>
                                        <Divider className="bg-neutral-400"/>
                                    </div>
                                })}
                            </div>
                        </div>
                    </div>
                    
                </div>
            </div>
        </>}
        
    </FullScreenLoadingOverlay>
}

export default AddOns