import {
    Tooltip, 
    IconButton, 
    TextField, 
    Button,
    Collapse
} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faArrowLeft} from "@fortawesome/free-solid-svg-icons"
import { ReactNode, useMemo, useRef, useState } from "react"
import { useDebounce } from "../../hooks/debounce"
import { isUrl } from "../../lib/utils/urls/isUrl"
import {useAppContext} from "../../routes/store"
import LoadingIcon from "../LoadingIcon"
import { UpdateCheckResponse } from "../../lib/shabah/updateCheckStatus"
import {
    PermissionsSummary, 
    generatePermissionsSummary,
    hasUnsafePermissions
} from "../../lib/utils/security/permissionsSummary"
import { CargoSummary } from "./CargoSummary"
import {HuzmaManifest, MANIFEST_FILE_SUFFIX} from "huzma"
import type {Permissions} from "../../lib/types/permissions"
import {ManifestIndex, Shabah} from "../../lib/shabah/downloadClient"
import { MOD_CARGO_TAG, EXTENSION_CARGO_TAG } from "../../config"
import { useGlobalConfirm } from "../../hooks/globalConfirm"
import { sleep } from "../../lib/utils/sleep"
import { EXTENSION_METADATA_KEY } from "../../lib/utils/cargos"
import { ALLOW_UNSAFE_PACKAGES } from "../../lib/utils/localStorageKeys"
import { useCloseOnEscape } from "../../hooks/closeOnEscape"
import {CargoRequestError, cargoErrorToText} from "../../lib/utils/errors/cargoErrors"
import { CACHED } from "../../lib/shabah/backend"
import { useNavigate } from "react-router-dom"
import { ADDONS_MODAL, ADDONS_VIEWING_CARGO } from "../../lib/utils/searchParameterKeys"
import { GAME_EXTENSION_CARGO, LAUNCHER_CARGO } from "../../standardCargos"

const toCargoIndex = (
    canonicalUrl: string,
    resolvedUrl: string,
    cargo: HuzmaManifest<Permissions>,
    isExtension: boolean,
    bytes: number,
    manifestName: string,
): ManifestIndex => {
    return {
        tag: isExtension ? EXTENSION_CARGO_TAG : MOD_CARGO_TAG,
        name: cargo.name,
        logo: cargo.crateLogoUrl,
        resolvedUrl,
        canonicalUrl,
        bytes,
        manifestName,
        entry: cargo.entry,
        version: cargo.version,
        permissions: cargo.permissions,
        state: CACHED,
        created: Date.now(),
        updated: Date.now(),
        downloadId: ""
    }
}

type InstallResponse = {
    checkResponse: UpdateCheckResponse
    permissions: {
        isUnsafe: boolean
        summary: PermissionsSummary
    }
    isExtension: boolean
}


export type InstallerProps = {
    onClose: () => void
    onInstallCargo: (update: UpdateCheckResponse, title: string) => Promise<boolean>
    createAlert: (message: ReactNode) => void
    onCheckIfCanonicalCargoExists: (canonicalUrl: string) => Promise<boolean>
    onUpdateCargo: (canonicalUrl: string) => unknown
}

export const Installer = ({
    onClose,
    onInstallCargo,
    createAlert,
    onCheckIfCanonicalCargoExists,
    onUpdateCargo
}: InstallerProps): JSX.Element => {
    const urlCheck = useDebounce(1_000)
    const {downloadClient, logger} = useAppContext()
    const confirm = useGlobalConfirm()
    useCloseOnEscape(onClose)

    const [url, setUrl] = useState("")
    const [invalidation, setInvalidation] = useState<CargoRequestError>("none")
    const [ioOperation, setIoOperation] = useState(false)
    const [installResponse, setInstallResponse] = useState<null | InstallResponse>(null)
    const [cacheError, setCacheError] = useState("")

    const {current: updateUrl} = useRef((nextUrl: string) => {
        setUrl(nextUrl)
        setInvalidation("analyzing")
        urlCheck(async () => {
            const alreadyExists = await onCheckIfCanonicalCargoExists(nextUrl)
            if (alreadyExists) {
                setInvalidation("manifest-already-exists")
            } else if (!nextUrl.startsWith("https://") && !nextUrl.startsWith("http://")) {
                setInvalidation("malformed-url")
            } else if (!isUrl(nextUrl)) {
                setInvalidation("malformed-url")
            } else if (!nextUrl.endsWith(MANIFEST_FILE_SUFFIX)) {
                setInvalidation("invalid-manifest-url")
            } else {
                setInvalidation("none")
            }
        })
    })

    const packageHelperText = useMemo(() => {
        return cargoErrorToText(invalidation)
    }, [invalidation])

    const showCargo = !!installResponse?.checkResponse.newCargo
    const installText = cacheError.length > 0
        ? "Retry"
        : "Confirm"
    const submitText = showCargo ? installText : "Install"

    const onDownload = async () => {
        const updateResponse = await downloadClient.checkForUpdates({
            tag: -1,
            canonicalUrl: url
        })
        logger.info("Inital cargo check response", updateResponse)
        if (updateResponse.status === Shabah.STATUS.remoteResourceNotFound) {
            setInvalidation("not-found")
            return
        }
        if (updateResponse.status === Shabah.STATUS.badHttpCode) {
            setInvalidation("network-error")
            return
        }
        if (updateResponse.status === Shabah.STATUS.preflightVerificationFailed) {
            setInvalidation("invalid-resource-detected")
            return
        }
        if (
            updateResponse.status === Shabah.STATUS.invalidManifestEncoding
            || updateResponse.status === Shabah.STATUS.encodingNotAcceptable
            || updateResponse.status === Shabah.STATUS.invalidRedirect
        ) {
            setInvalidation("invalid-encoding")
            return
        }
        if (updateResponse.errorOccurred()) {
            setInvalidation("catch-all-error")
            return
        }

        if (!updateResponse.enoughStorageForCargo()) {
            setInvalidation("insufficent-storage")
            return
        }
        const permissionsSummary = generatePermissionsSummary(
            updateResponse.newCargo?.permissions || []
        )
        const isUnsafe = hasUnsafePermissions(permissionsSummary)
        if (
            isUnsafe
            && url !== LAUNCHER_CARGO.canonicalUrl
            && url !== GAME_EXTENSION_CARGO.canonicalUrl
            && !localStorage.getItem(ALLOW_UNSAFE_PACKAGES)
        ) {
            logger.warn(`prevented unsafe add-on from being added. Url=${url}`)
            setInvalidation("catch-all-error")
            return
        }
        const isExtension = updateResponse.newCargo?.metadata[EXTENSION_METADATA_KEY] === "true"
        if (isExtension) {
            updateResponse.tag = EXTENSION_CARGO_TAG
        } else {
            updateResponse.tag = MOD_CARGO_TAG
        }
        setInstallResponse({
            checkResponse: updateResponse,
            permissions: {
                summary: permissionsSummary,
                isUnsafe: isUnsafe
            },
            isExtension
        })
    }

    const onCacheCargo = async () => {
        if (!installResponse || !installResponse.checkResponse.newCargo) {
            return
        }
        const {isUnsafe} = installResponse.permissions
        if (!await confirm({title: `Are you sure you want to install this ${isUnsafe ? "unsafe ": ""} add-on?`, confirmButtonColor: isUnsafe ? "error" : "warning"})) {
            return
        }
        setIoOperation(true)
        setCacheError("")
        const {newCargo} = installResponse.checkResponse
        const updateTitle = `${newCargo.name} v${newCargo.version}`
        const [ok] = await Promise.all([
            onInstallCargo(installResponse.checkResponse, updateTitle),
            sleep(1_000)
        ] as const)
        if (ok) {
            createAlert("Queued Download")
            onClose()
            return
        }
        setIoOperation(false)
        setCacheError("An error occurred")
    }

    const onSubmit = async () => {
        if (!showCargo) {
            setIoOperation(true)
            await onDownload()
            setIoOperation(false)
        } else {
            await onCacheCargo()
        }
    }

    const onCancel = () => {
        if (showCargo) {
            setInstallResponse(null)
            setCacheError("")
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
                    <Collapse in={cacheError.length > 0}>
                        <div className="w-full text-sm text-center text-red-500 mb-1">
                            {cacheError}
                        </div>
                    </Collapse>
                    
                    <CargoSummary 
                        cargo={installResponse.checkResponse.newCargo as HuzmaManifest<Permissions>}
                        cargoIndex={toCargoIndex(
                            installResponse.checkResponse.canonicalUrl,
                            installResponse.checkResponse.resolvedUrl,
                            installResponse.checkResponse.newCargo as HuzmaManifest<Permissions>,
                            installResponse.isExtension,
                            installResponse.checkResponse.bytesToDownload(),
                            installResponse.checkResponse.manifestName
                        )}
                        safeExternalNavigation
                    />
                </div> : <>
                    <div className="mb-1 pt-2 px-3">
                        <div className="text-xs ml-1 mb-1 text-neutral-300">
                            {"New Add-on"}
                        </div>
                        <TextField
                            id="cargo-url"
                            fullWidth
                            name="cargo-url"
                            placeholder="Add-on url..."
                            value={url}
                            disabled={ioOperation}
                            error={
                                invalidation !== "none" 
                                && invalidation !== "analyzing"
                            }
                            onChange={(event) => updateUrl(event.target.value)}
                            helperText={invalidation === "analyzing"
                                ? <span className="animate-pulse">
                                    {packageHelperText}
                                </span>
                                : <>{packageHelperText}</>
                            }
                        />
                    </div>
                </>}

                <div className="px-3">
                    {invalidation === "manifest-already-exists" ? <>
                        <Button
                            type="submit"
                            className="w-1/2"
                            onClick={async () => {
                                if (!await confirm({title: "Are you sure you want to update inputted add-on?", confirmButtonColor: "warning"})) {
                                    return
                                }
                                onUpdateCargo(url)
                            }}
                        >
                            Update
                        </Button>
                    </> : <>
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
                                : submitText
                            }
                        </Button>
                    </>}

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