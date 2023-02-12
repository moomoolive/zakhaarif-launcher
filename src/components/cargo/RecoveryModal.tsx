import { Tooltip, IconButton, Button } from "@mui/material"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {faArrowLeft, faBug, faDownload, faRotate, faThumbsUp, faTrash} from "@fortawesome/free-solid-svg-icons"
import LoadingIcon from "../LoadingIcon"
import { ReactNode, useRef, useState } from "react"
import {CargoIndex} from "../../lib/shabah/downloadClient"
import { useEffectAsync } from "../../hooks/effectAsync"
import { isInErrorState } from "../../lib/utils/cargos"
import { useCloseOnEscape } from "../../hooks/closeOnEscape"
import { sleep } from "../../lib/utils/sleep"
import { useGlobalConfirm } from "../../hooks/globalConfirm"

export type RecoveryModalProps = {
    cargoIndex: CargoIndex
    onClose: () => unknown
    onCreateAlert: (type: "success" | "error", content: ReactNode) => unknown
    onRetryDownload: (canonicalUrl: string, title: string) => Promise<boolean>
    onDeleteCargo: (canonicalUrl: string) => Promise<boolean>
}

export const RecoveryModal = ({
    cargoIndex,
    onClose,
    onCreateAlert,
    onRetryDownload,
    onDeleteCargo,
}: RecoveryModalProps): JSX.Element => {
    const confirm = useGlobalConfirm()
    useCloseOnEscape(onClose)

    const [loading, setLoading] = useState(true)
    const [noErrorsFound, setNoErrorsFound] = useState(false)
    const [waitingOnAction, setWaitingOnAction] = useState(false)

    const {current: retryDownload} = useRef(async () => {
        if (!await confirm({title: "Are you sure you want to retry downloading?", confirmButtonColor: "success"})) {
            return
        }
        const {name, version, canonicalUrl} = cargoIndex
        const title = `${name} v${version} retry`
        setWaitingOnAction(true)
        const [response] = await Promise.all([
            onRetryDownload(canonicalUrl, title),
            sleep(2_000)
        ] as const)
        setWaitingOnAction(false)
        if (!response) {
            onCreateAlert("error", "Download retry failed")
            return
        }
        onCreateAlert("success", "Successfully queued retry")
        onClose()
    })
    const {current: deleteCargo} = useRef(async () => {
        if (!await confirm({title: "Are you sure you want to delete this add-on forever?", confirmButtonColor: "error"})) {
            return
        }
        const {canonicalUrl} = cargoIndex
        setWaitingOnAction(true)
        const [response] = await Promise.all([
            onDeleteCargo(canonicalUrl),
            sleep(2_000)
        ] as const)
        setWaitingOnAction(false)
        if (!response) {
            onCreateAlert("error", "Could not delete add-on")
            return
        }
        onCreateAlert("success", "Deleted successfully")
        onClose()
    })

    useEffectAsync(async () => {
        //if (!isInErrorState(cargoIndex)) {
        //    setNoErrorsFound(true)
        //    setLoading(false)
        //    return
        //}
        setLoading(false)
    }, [])

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

        <div className="w-5/6 max-w-md py-2 animate-fade-in-left rounded bg-neutral-800">
            {loading ? <>
                <div className="w-full py-4 text-center">
                    <div className="text-3xl animate-spin mb-2 text-blue-500">
                        <LoadingIcon/>
                    </div>
                    <div className="text-sm text-neutral-300">
                        {"One Moment..."}
                    </div>
                </div>
            </> : <>
                {noErrorsFound ? <>
                    <div className="w-full pt-4 pb-2 text-center px-3">
                        <div className="text-3xl mb-2 text-green-500">
                            <FontAwesomeIcon icon={faThumbsUp}/>
                        </div>
                        <div className="text-sm mb-1 text-neutral-300">
                            {"Add-on is OK!"}
                        </div>
                        <div>
                            <Button
                                color="success"
                                onClick={onClose}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </> : <>
                <div className="w-full pt-4 pb-2 text-center px-3">
                        <div className="text-3xl mb-2 text-yellow-500">
                            <FontAwesomeIcon icon={faBug}/>
                        </div>
                        <div className="text-lg mb-4 text-neutral-300">
                            {"Error detected"}
                        </div>
                        <div className="text-sm text-left mb-1 text-neutral-400">
                            {"Here's some potential fixes:"}
                        </div>
                        
                        <div className="text-left mb-4">
                            <button 
                                className="py-1 px-2 rounded hover:bg-neutral-700 hover:text-blue-500 disabled:text-neutral-600 disabled:bg-neutral-800"
                                disabled={waitingOnAction}
                                onClick={retryDownload}
                            >
                                <span className="mr-2 text-blue-500">
                                    <FontAwesomeIcon icon={faRotate}/>
                                </span>
                                {"Retry Download"}
                            </button>
                            
                            <button 
                                className="py-1 px-2 rounded hover:bg-neutral-700 hover:text-red-500 disabled:text-neutral-600 disabled:bg-neutral-800"
                                disabled={waitingOnAction}
                                onClick={deleteCargo}
                            >
                                <span className="mr-2 text-red-500 ml-0.5">
                                    <FontAwesomeIcon icon={faTrash}/>
                                </span>
                                {"Delete Add-on"}
                            </button>
                        </div>
                        
                        <div>
                            <Button
                                color="warning"
                                fullWidth
                                onClick={onClose}
                                disabled={waitingOnAction}
                            >
                                {waitingOnAction ? <span className="animate-spin text-lg">
                                    <LoadingIcon/>
                                </span> : "Close"}
                            </Button>
                        </div>
                    </div>
                </>}
            </>}
        </div>
    </div>
}