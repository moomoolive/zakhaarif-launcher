import {Tooltip} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faArrowLeft,} from "@fortawesome/free-solid-svg-icons"
import {IconButton} from "@mui/material"
import {HuzmaManifest} from "huzma"
import {ManifestIndex} from "../../lib/shabah/downloadClient"
import {Permissions,} from "../../lib/types/permissions"
import { useCloseOnEscape } from "../../hooks/closeOnEscape"
import {CargoSummary} from "./CargoSummary"

export type CargoInfoProps = {
    onClose: () => void
    cargo: HuzmaManifest<Permissions>
    cargoIndex: ManifestIndex
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
                    <IconButton onClick={onClose}>
                        <FontAwesomeIcon icon={faArrowLeft}/>
                    </IconButton>
                </Tooltip>
            </div>
        </div>
        
        
        <div className="w-5/6 max-w-md py-3 rounded bg-neutral-800 animate-fade-in-left">
            <CargoSummary
                cargo={cargo}
                cargoIndex={cargoIndex}
                showModificationMetadata
                showImportLinkCopy
            />
        </div>
        
    </div>
}