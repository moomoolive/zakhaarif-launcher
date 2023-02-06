import {
    Tooltip, 
    IconButton, 
    ClickAwayListener, 
    TextField, 
    Button
} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faArrowLeft} from "@fortawesome/free-solid-svg-icons"
import { useMemo, useRef, useState } from "react"
import { useDebounce } from "../../hooks/debounce"
import { isUrl } from "../../lib/utils/urls/isUrl"
import {useAppShellContext} from "../../routes/store"
import LoadingIcon from "../LoadingIcon"
import { UpdateCheckResponse } from "../../lib/shabah/updateCheckStatus"
import {
    PermissionsSummary, 
    generatePermissionsSummary,
    hasUnsafePermissions
} from "../../lib/utils/security/permissionsSummary"
import { CargoSummary } from "./CargoInfo"
import type {Cargo} from "../../lib/cargo"
import type {Permissions} from "../../lib/types/permissions"
import type {CargoIndex} from "../../lib/shabah/downloadClient"
import { MOD_CARGO_TAG, EXTENSION_CARGO_TAG } from "../../config"
import { useGlobalConfirm } from "../../hooks/globalConfirm"
import { sleep } from "../../lib/utils/sleep"
import { EXTENSION_METADATA_KEY } from "../../lib/utils/cargos"


type InvalidType = (
    "malformed-url"
    | "analyzing"
    | "none"
)

type InstallResponse = {
    checkResponse: UpdateCheckResponse
    permissions: {
        isUnsafe: boolean
        summary: PermissionsSummary
    }
    isExtension: boolean
}

const toCargoIndex = (
    canonicalUrl: string,
    resolvedUrl: string,
    cargo: Cargo<Permissions>,
    isExtension: boolean,
    bytes: number
): CargoIndex => {
    return {
        tag: isExtension ? EXTENSION_CARGO_TAG : MOD_CARGO_TAG,
        name: cargo.name,
        logoUrl: cargo.crateLogoUrl,
        resolvedUrl,
        canonicalUrl,
        bytes,
        entry: cargo.entry,
        version: cargo.version,
        permissions: cargo.permissions,
        state: "cached",
        storageBytes: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        downloadQueueId: ""
    }
}

export type InstallerProps = {
    onClose: () => void
    onInstallCargo: (update: UpdateCheckResponse, title: string) => Promise<boolean>
}

export const Installer = ({
    onClose,
    onInstallCargo
}: InstallerProps): JSX.Element => {
    const urlCheck = useDebounce(1_000)
    const {downloadClient} = useAppShellContext()
    const confirm = useGlobalConfirm()

    const [url, setUrl] = useState("")
    const [invalidation, setInvalidation] = useState<InvalidType>("none")
    const [ioOperation, setIoOperation] = useState(false)
    const [installResponse, setInstallResponse] = useState<null | InstallResponse>(null)

    const {current: updateUrl} = useRef((nextUrl: string) => {
        setUrl(nextUrl)
        setInvalidation("analyzing")
        urlCheck(() => {
            const correctUrl = isUrl(nextUrl)
            if (correctUrl) {
                setInvalidation("none")
            } else {
                setInvalidation("malformed-url")
            }
        })
    })

    const packageHelperText = useMemo(() => {
        switch (invalidation) {
            case "malformed-url":
                return <>{"Invalid url"}</>
            case "analyzing":
                return <span className="animate-pulse">{"Loading..."}</span>
            default:
                return <></>
        }
    }, [invalidation])

    const showCargo = !!installResponse?.checkResponse.newCargo

    const onDownload = async () => {
        setIoOperation(true)
        const updateRepsonse = await downloadClient.checkForUpdates({
            tag: "",
            canonicalUrl: url
        })
        console.log("response", updateRepsonse)
        const permissionsSummary = generatePermissionsSummary(
            updateRepsonse.newCargo?.permissions || []
        )
        const unsafe = hasUnsafePermissions(permissionsSummary)
        console.log("meta", updateRepsonse.newCargo?.metadata)
        const isExtension = updateRepsonse.newCargo?.metadata[EXTENSION_METADATA_KEY] === "true"
        if (isExtension) {
            updateRepsonse.tag = EXTENSION_CARGO_TAG
        } else {
            updateRepsonse.tag = MOD_CARGO_TAG
        }
        setInstallResponse({
            checkResponse: updateRepsonse,
            permissions: {
                summary: permissionsSummary,
                isUnsafe: unsafe
            },
            isExtension
        })
        setIoOperation(false)
    }

    const onCacheCargo = async () => {
        if (!installResponse || !installResponse.checkResponse.newCargo) {
            return
        }
        if (!await confirm({title: "Are you sure you want to install this package?", confirmButtonColor: "warning"})) {
            return
        }
        setIoOperation(true)
        await sleep(2_000)
        const {newCargo} = installResponse.checkResponse
        const updateTitle = `${newCargo.name} v${newCargo.version}`
        const ok = await onInstallCargo(
            installResponse.checkResponse,
            updateTitle
        )
        console.log("install response", ok)
        if (ok) {
            onClose()
            return
        }
        setIoOperation(false)
    }

    const onSubmit = async () => {
        
        if (!showCargo) {
            await onDownload()
        } else {
            await onCacheCargo()
        }
    }

    const onCancel = () => {
        if (showCargo) {
            setInstallResponse(null)
            setUrl("")
        } else {
            onClose()
        }
    }

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
            <form 
                onSubmit={(event) => {
                    event.preventDefault()
                    onSubmit()
                }}
                className="pb-1"
            >
                {showCargo ? <div className="w-full animate-fade-in-left">
                    <CargoSummary 
                        cargo={installResponse.checkResponse.newCargo as Cargo<Permissions>}
                        cargoIndex={toCargoIndex(
                            installResponse.checkResponse.canonicalUrl,
                            installResponse.checkResponse.resolvedUrl,
                            installResponse.checkResponse.newCargo as Cargo<Permissions>,
                            installResponse.isExtension,
                            installResponse.checkResponse.bytesToDownload()
                        )}
                    />
                </div> : <>
                    <div className="mb-1 pt-2 px-3">
                        <div className="text-xs ml-1 mb-1 text-neutral-300">
                            {"Add a Package"}
                        </div>
                        <TextField
                            id="cargo-url"
                            fullWidth
                            name="cargo-url"
                            placeholder="Enter a url..."
                            value={url}
                            disabled={ioOperation}
                            error={
                                invalidation !== "none" 
                                && invalidation !== "analyzing"
                            }
                            onChange={(event) => updateUrl(event.target.value)}
                            helperText={packageHelperText}
                        />
                    </div>
                </>}

                <div className="px-3">
                    <Button
                        type="submit"
                        className="w-1/2"
                        disabled={
                            invalidation !== "none" 
                            || url.length < 1
                            || ioOperation
                        }
                        onClick={onSubmit}
                    >
                        {ioOperation 
                            ? <span className="text-lg animate-spin">
                                <LoadingIcon/>
                            </span> 
                            : showCargo ? "Install" : "Fetch"
                        }
                    </Button>

                    <Button
                        className="w-1/2"
                        color="error"
                        onClick={onCancel}
                    >
                        {showCargo ? "Back" : "Cancel"}
                    </Button>
                </div>
            </form>
        </div>
    </div>
}