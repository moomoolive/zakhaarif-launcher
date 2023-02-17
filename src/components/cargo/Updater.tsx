import { Tooltip, IconButton, Button, Divider, Collapse } from "@mui/material"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {faArrowLeft, faThumbsUp, faXmark} from "@fortawesome/free-solid-svg-icons"
import { useCloseOnEscape } from "../../hooks/closeOnEscape"
import {CargoIndex, Shabah} from "../../lib/shabah/downloadClient"
import { useRef, useState, ReactNode } from "react"
import { UpdateCheckResponse } from "../../lib/shabah/updateCheckStatus"
import { useEffectAsync } from "../../hooks/effectAsync"
import { useAppContext } from "../../routes/store"
import LoadingIcon from "../LoadingIcon"
import {cargoErrorToText} from "../../lib/utils/errors/cargoErrors"
import { sleep } from "../../lib/utils/sleep"
import {
    PermissionsSummary, 
    generatePermissionsSummary,
    hasUnsafePermissions,
    diffPermissions,
    PermissionsDifference,
} from "../../lib/utils/security/permissionsSummary"
import { ALLOW_UNSAFE_PACKAGES } from "../../lib/utils/localStorageKeys"
import { isExtension } from "../../lib/utils/cargos"
import { Cargo } from "../../lib/cargo"
import { Permissions } from "../../lib/types/permissions"
import { readableByteCount } from "../../lib/utils/storage/friendlyBytes"
import { PermissionsDisplay } from "./PermissionsDisplay"
import { useGlobalConfirm } from "../../hooks/globalConfirm"

type UpdateState = "error" | "up-to-date"

type UpdateResponse = {
    checkResponse: UpdateCheckResponse
    permissions: {
        isUnsafe: boolean
        summary: PermissionsSummary
        diffedPermissions: PermissionsDifference
    }
    isExtension: boolean
}

export type CargoUpdaterProps = {
    onClose: () => void
    cargoIndex: CargoIndex
    cargo: Cargo<Permissions>
    createAlert: (message: ReactNode) => void
    onUpdateCargo: (update: UpdateCheckResponse, title: string) => Promise<boolean>
}

export const CargoUpdater = ({
    onClose,
    cargoIndex,
    cargo,
    createAlert,
    onUpdateCargo
}: CargoUpdaterProps): JSX.Element => {
    const {downloadClient, logger} = useAppContext()
    const confirm = useGlobalConfirm()
    useCloseOnEscape(onClose)

    const [cargoUpdateResponse, setCargoUpdateResponse] = useState<UpdateResponse | null>(null)
    const [fetchingUpdate, setFetchingUpdate] = useState(true)
    const [updaterState, setUpdaterState] = useState<UpdateState>("up-to-date")
    const [queuedUpdate, setQueuedUpdate] = useState(false)
    const [updateError, setUpdateError] = useState("")

    const errorMessage = useRef("")
    const {current: endWithError} = useRef((error: string) => {
        errorMessage.current = error
        setUpdaterState("error")
        setFetchingUpdate(false)
    })
    const updateBytes = useRef("")
    const {current: fetchUpdate} = useRef(async () => {
        setFetchingUpdate(true)
        const {tag, canonicalUrl} = cargoIndex
        const [updateResponse] = await Promise.all([
            downloadClient.checkForUpdates({tag, canonicalUrl}),
            sleep(1_000)
        ] as const)
        logger.info("raw update response", updateResponse)
        if (updateResponse.status === Shabah.STATUS.manifestIsUpToDate) {
            setFetchingUpdate(false)
            setUpdaterState("up-to-date")
            return
        }
        if (updateResponse.status === Shabah.STATUS.remoteResourceNotFound) {
            return endWithError(cargoErrorToText("not-found"))
        }
        if (updateResponse.status === Shabah.STATUS.badHttpCode) {
            return endWithError(cargoErrorToText("network-error"))
        }
        if (
            updateResponse.status === Shabah.STATUS.invalidManifestEncoding
            || updateResponse.status === Shabah.STATUS.encodingNotAcceptable
            || updateResponse.status === Shabah.STATUS.invalidRedirect
        ) {
            return endWithError(cargoErrorToText("invalid-encoding"))
        }

        if (!updateResponse.enoughStorageForCargo()) {
            return endWithError(cargoErrorToText("insufficent-storage"))
        }
        if (updateResponse.errorOccurred() || !updateResponse.newCargo) {
            return endWithError(cargoErrorToText("catch-all-error"))
        }

        const permissionsSummary = generatePermissionsSummary(
            updateResponse.newCargo.permissions
        )

        const isUnsafe = hasUnsafePermissions(permissionsSummary)
        if (
            isUnsafe
            && canonicalUrl !== import.meta.env.VITE_APP_LAUNCHER_CARGO_URL
            && canonicalUrl !== import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL
            && !localStorage.getItem(ALLOW_UNSAFE_PACKAGES)
        ) {
            logger.warn(`prevented unsafe cargo from being updated. Url=${canonicalUrl}`)
            return endWithError(cargoErrorToText("catch-all-error"))
        }
        setCargoUpdateResponse({
            checkResponse: updateResponse,
            permissions: {
                summary: permissionsSummary,
                isUnsafe: isUnsafe,
                diffedPermissions: diffPermissions(
                    cargo.permissions,
                    updateResponse.newCargo.permissions
                )
            },
            isExtension: isExtension(cargoIndex)
        })
        const byteCount = updateResponse.bytesToDownload()
        if (byteCount < 1) {
            updateBytes.current = "0.00 KB"
        } else {
            const {count, metric} = readableByteCount(updateResponse.bytesToDownload())
            updateBytes.current = `${count} ${metric.toUpperCase()}`
        }
        setFetchingUpdate(false)
    })
    const {current: updateCargo} = useRef(async (updateCheck: UpdateResponse) => {
        const update = updateCheck.checkResponse
        if (!update.newCargo) {
            return
        }
        const {isUnsafe} = updateCheck.permissions
        if (!await confirm({title: `Are you sure you want to update this ${isUnsafe ? "unsafe ": ""}Add-on?`, confirmButtonColor: isUnsafe ? "error" : "warning"})) {
            return
        }
        setUpdateError("")
        setQueuedUpdate(true)
        const {newCargo} = update
        const updateTitle = `${newCargo.name} v${newCargo.version}`
        const [ok] = await Promise.all([
            onUpdateCargo(update, updateTitle),
            sleep(1_000)
        ] as const)
        if (ok) {
            createAlert("Queued Download")
            onClose()
            return
        }
        setQueuedUpdate(false)
        setUpdateError("An error occurred")
    })

    useEffectAsync(fetchUpdate, [])

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
            {fetchingUpdate ? <>
                <div className="w-full py-4 text-center">
                    <div className="text-3xl animate-spin mb-2 text-blue-500">
                        <LoadingIcon/>
                    </div>
                    <div className="text-sm text-neutral-300">
                        {"Checking for update..."}
                    </div>
                </div>
            </> : <>
                {!cargoUpdateResponse?.checkResponse.newCargo ? <>
                    <div className="w-full text-center">
                        {((updateState: UpdateState) => {
                            switch (updateState) {
                                case "error":
                                    return <div className="pt-1">
                                        <div className="text-red-500 text-2xl">
                                            <FontAwesomeIcon icon={faXmark}/>
                                        </div>
                                        <div className="text-sm text-neutral-300 mb-1">
                                            {errorMessage.current}
                                        </div>
                                        <div>
                                            <Button
                                                color="info"
                                                onClick={fetchUpdate}
                                            >
                                                Retry
                                            </Button>
                                            <Button
                                                onClick={onClose}
                                                color="warning"
                                            >
                                                Close
                                            </Button>
                                        </div>
                                    </div>
                                case "up-to-date":
                                    return <div className="pt-1">
                                        <div className="text-green-500 text-2xl mb-1">
                                            <FontAwesomeIcon icon={faThumbsUp}/>
                                        </div>
                                        <div className="text-sm text-neutral-300 mb-1">
                                            {"You are on the latest version"}
                                        </div>
                                        <div>
                                            <Button
                                                onClick={onClose}
                                                color="success"
                                            >
                                                Close
                                            </Button>
                                        </div>
                                    </div>
                                default:
                                    return <></>
                            }
                        })(updaterState)}
                    </div>
                </> : <>
                    <div className="w-full px-3 py-1">
                        <div className="text-center mb-3">
                            {"Update found"}
                        </div>
                        
                        <div className="text-sm">
                            <div>
                                <span className="text-blue-500">
                                    {"Old Version: "}
                                </span>
                                <span className="text-neutral-400">
                                    {`v${cargo.version}`}
                                </span>
                            </div>
                            
                            <div>
                                <span className="text-blue-500">
                                    {"New Version: "}
                                </span>
                                <span className="text-green-500">
                                    {`v${cargoUpdateResponse.checkResponse.newCargo.version}`}
                                </span>
                            </div>

                            <div>
                                <span className="text-blue-500">
                                    {"Update Size: "}
                                </span>
                                <span>
                                    {updateBytes.current}
                                </span>
                                {cargoUpdateResponse.checkResponse.downloadableResources.length > 0 ? <>
                                    <span className="text-xs text-neutral-400 ml-1">
                                        {`(${cargoUpdateResponse.checkResponse.downloadableResources.length} new file${cargoUpdateResponse.checkResponse.downloadableResources.length === 1 ? "" : "s"})`}
                                    </span>
                                </> : <></>}
                            </div>
                        </div>

                        <div className="my-2">
                            <Divider className="bg-neutral-700 w-full"/>
                        </div>
                        

                        <div className="mb-5">
                            <div className="text-xs text-yellow-300 pb-1">
                                {"New Permissions:"}
                            </div>
                            <div
                                className="overflow-y-scroll overflow-x-clip"
                                style={{maxHeight: "80px"}}
                            >
                                {cargoUpdateResponse.permissions.diffedPermissions.added.map((permission, index) => {
                                    return <div
                                        key={`new-permission-${index}`}
                                    >
                                        <PermissionsDisplay permission={permission}/>
                                    </div>
                                })}
                            </div>

                            <Collapse in={updateError.length > 0}>
                                <div className="w-full text-sm text-center text-red-500 mb-1">
                                    {updateError}
                                </div>
                            </Collapse>
                        </div>

                        <div className="text-center">
                            <Button
                                onClick={() => updateCargo(cargoUpdateResponse)}
                                color="success"
                                className="w-1/2"
                                disabled={queuedUpdate}
                            >
                                {queuedUpdate
                                    ? <span className="text-lg animate-spin">
                                        <LoadingIcon/>
                                    </span>
                                    : updateError.length > 0 ? "Retry" : "Update"
                                }
                            </Button>
                            <Button
                                onClick={onClose}
                                color="error"
                                className="w-1/2"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </>}
            </>}
        </div>
    </div>
}