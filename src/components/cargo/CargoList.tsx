import type {CargoIndex, CargoState} from "../../lib/shabah/downloadClient"
import { readableByteCount } from "../../lib/utils/storage/friendlyBytes"
import { Tooltip } from "@mui/material"
import { reactiveDate } from "../../lib/utils/dates"
import { isMod } from "../../lib/utils/cargos"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFolder } from "@fortawesome/free-solid-svg-icons"
import UpdatingAddonIcon from "@mui/icons-material/Sync"
import FailedAddonIcon from "@mui/icons-material/ReportProblem"
import { useRef } from "react"

type CargoSummaryProps = {
    onClick: () => void | Promise<void>
    icon: JSX.Element
    name: string
    type: string
    updatedAt: number
    byteCount: number
    status: JSX.Element
}

const CargoIndexSummary = ({
    onClick, 
    icon, 
    name,
    type,
    updatedAt,
    byteCount,
    status,
}: CargoSummaryProps) => {
    const friendlyBytes = readableByteCount(byteCount)

    return <button
        className="p-4 w-full text-left flex justify-center items-center hover:bg-neutral-900"
        onClick={onClick}
    >
        
        <div className={`relative z-0 w-1/2 lg:w-1/3 whitespace-nowrap text-ellipsis overflow-clip`}>
            {icon}
            {name}
        </div>
        
        <div className="hidden lg:block w-1/6 text-center text-xs text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
            {status}
        </div>

        <div className={`w-1/6 hidden md:block text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip`}>
            {type}
        </div>
        
        <div className={`w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip`}>
            {reactiveDate(new Date(updatedAt))}
        </div>
        
        <div className="w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
            {`${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`}
        </div>
    </button>
}

type CargoSummaryIconProps = {
    cargoState: CargoState, 
    isAMod: boolean
}

const CargoSummaryIcon = ({cargoState, isAMod}: CargoSummaryIconProps): JSX.Element => {
    switch (cargoState) {
        case "aborted":
        case "failed":
            return <>
            <span className={"mr-3"}>
                <FontAwesomeIcon 
                    icon={faFolder}
                />
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
                    <FontAwesomeIcon icon={faFolder}/>
                </span>
                <div className="absolute z-10 bottom-0 left-0 animate-spin">
                    <UpdatingAddonIcon
                        style={{fontSize: "12px"}}
                    />
                </div>
            </>
        default:
            return <>
                <span className={"mr-3 " + (isAMod ? "text-indigo-500" : "text-green-500")}>
                    <FontAwesomeIcon 
                        icon={faFolder}
                    />
                </span>
            </>
    }
}

export type CargoListProps = {
    onViewCargo: (url: string) => void
    cargosIndexes: CargoIndex[]
    hasMore: boolean
}

export const CargoList = ({
    onViewCargo,
    cargosIndexes
}: CargoListProps): JSX.Element => {

    const {current: cargoStatus} = useRef((cargoState: CargoState) => {
        switch (cargoState) {
            case "aborted":
            case "failed":
                return <span className="text-red-500">
                    {"Failed"}
                </span>
            case "updating":
                return <span className="text-blue-500">
                    {"Updating"}
                </span>
            default:
                return <span>{"Saved"}</span>
        }
    })

    return <div 
        className="w-full h-5/6 overflow-y-scroll animate-fade-in-left"
    >
        {cargosIndexes.map((cargo, index) => {
            const isAMod = isMod(cargo)
            return <CargoIndexSummary
                key={`cargo-summary-${index}`}
                onClick={() => onViewCargo(cargo.canonicalUrl)}
                icon={<CargoSummaryIcon 
                    cargoState={cargo.state}
                    isAMod={isAMod} 
                />}
                name={cargo.name}
                status={cargoStatus(cargo.state)}
                type={isAMod ? "mod" : "extension"}
                updatedAt={cargo.updated}
                byteCount={cargo.bytes}
            />
        })}
        <div className="sm:hidden h-8" />
    </div> 
}