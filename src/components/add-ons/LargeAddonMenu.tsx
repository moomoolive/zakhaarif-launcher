import {
    Button, 
    Fab,
    Divider, 
    LinearProgress
} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faPuzzlePiece, 
    faHardDrive,
    faSignal,
    faPlus,
    faGear,
} from "@fortawesome/free-solid-svg-icons"
import {toGigabytesString} from "../../lib/utils/storage/friendlyBytes"

export type LargeAddonMenuProps = {
    cargoCount: number
    storageUsage: {used: number, total: number}
    isError: boolean
    loading: boolean
    className?: string
    onShowInstaller: () => unknown
    onShowStats: () => unknown
    onShowSettings: () => unknown
}

export const LargeAddonMenu = ({
    cargoCount,
    storageUsage,
    isError,
    loading,
    className = "",
    onShowInstaller,
    onShowStats,
    onShowSettings,
}: LargeAddonMenuProps): JSX.Element => {
    const storagePercent = loading || isError
        ? 3.0
        : Math.max(3.0, storageUsage.used / storageUsage.total) 

    return <div className={className}>
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
            <span>
                <Fab 
                    variant="extended" 
                    sx={{zIndex: "10"}}
                    onClick={onShowInstaller}
                    color="primary"
                >
                    <div className="flex items-center justify-center">
                        <div className="mr-2">
                            <span className="text-lg">
                                <FontAwesomeIcon icon={faPlus}/>
                            </span>
                        </div>
                        <div>
                            {"New Add-on"}
                        </div>
                    </div>                                
                </Fab>
            </span>
        </div>
        
        <div className="text-lg pb-4 text-neutral-300 w-11/12 rounded-r-full">
            <Button 
                fullWidth 
                disabled
                onClick={onShowStats}
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

            <Button 
                fullWidth 
                disabled
                onClick={onShowSettings}
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

        <div className="ml-14">
            <div className="w-7/12 mb-2">
                <LinearProgress 
                    variant="determinate" 
                    value={storagePercent} 
                />
            </div>
            

            <div className="py-1 text-xs">
                {loading ? <span 
                    className="animate-pulse"
                >
                    {"calculating..."}
                </span> : <>
                    {isError
                        ? "unknown"
                        : `${toGigabytesString(storageUsage.used, 1)} of ${toGigabytesString(storageUsage.total, 1)} used` 
                    }
                </>}
            
            </div>

            <div className="text-xs text-neutral-400">
                {`${cargoCount} Add-ons`}
            </div>
        </div>
    </div>
}