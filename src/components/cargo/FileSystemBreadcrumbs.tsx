import { Tooltip, Menu, MenuItem } from "@mui/material"
import { useState } from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faCaretDown, 
    faTrash,
    faAngleRight,
    faInfoCircle,
    faRotate,
    faPlay,
} from "@fortawesome/free-solid-svg-icons"
import { useAppShellContext } from "../../routes/store"
import { useGlobalConfirm } from "../../hooks/globalConfirm"
import {isExtension, isStandardCargo} from "../../lib/utils/cargos"
import type {CargoDirectory, RootDirectoryPath} from "./CargoFileSystem"
import type {CargoIndex} from "../../lib/shabah/downloadClient"
import {CargoIcon} from "./Icon"
import { NULL_FIELD as CARGO_NULL_FIELD, NULL_FIELD } from "../../lib/cargo"
import { useNavigate } from "react-router-dom"
import { EXTENSION_SHELL_TARGET } from "../../lib/utils/searchParameterKeys"

const ROOT_DIRECTORY_PATH: RootDirectoryPath = "#"

type FileSystemBreadcrumbsProps = {
    isViewingCargo: boolean
    cargoFound: boolean
    directoryPath: CargoDirectory[]
    targetCargo: CargoIndex | null
    onBackToCargos: () => unknown
    mutateDirectoryPath: (newValue: CargoDirectory[]) => unknown
    onShowCargoInfo: () => unknown
    onShowCargoUpdater: () => unknown
    onDeleteCargo: (canonicalUrl: string) => unknown
}

export const FileSystemBreadcrumbs = ({
    isViewingCargo,
    cargoFound,
    directoryPath,
    targetCargo,
    mutateDirectoryPath,
    onBackToCargos,
    onShowCargoInfo,
    onShowCargoUpdater,
    onDeleteCargo
}: FileSystemBreadcrumbsProps): JSX.Element => {
    const {downloadClient} = useAppShellContext()
    const confirm = useGlobalConfirm()
    const navigate = useNavigate()

    const [cargoMenuElement, setCargoMenuElement] = useState<HTMLElement | null>(null)

    return <div 
        className=" text-sm text-neutral-300 p-3 flex items-center flex-wrap"
    >
        <div>
            {isViewingCargo ? <>
                <Tooltip title="My Add-ons">
                    <button
                        className="hover:bg-gray-900 p-1 px-2 rounded text-neutral-400 animate-fade-in-left"
                        onClick={() => {
                            if (isViewingCargo) {
                                onBackToCargos()
                            }
                        }}
                    >
                        {"My Add-ons"}
                    </button>
                </Tooltip>
            </> : <>
                <button
                    className="hover:bg-gray-900 p-1 px-2 rounded"
                    onClick={(event) => setCargoMenuElement(event.currentTarget)}
                >
                    {"My Add-ons"}
                    <span className="ml-2">
                        <FontAwesomeIcon icon={faCaretDown}/>
                    </span>
                </button>

                <Menu
                    anchorEl={cargoMenuElement}
                    open={!!cargoMenuElement}
                    onClose={() => setCargoMenuElement(null)}
                >
                    <MenuItem
                        className="hover:text-red-500"
                        onClick={async () => {
                            if (!await confirm({title: "Are you sure you want to uninstall this app?", confirmButtonColor: "error"})) {
                                return
                            }
                            await downloadClient.uninstallAllAssets()
                            location.replace("/")
                        }}
                    >
                        <span className="mr-3">
                            <FontAwesomeIcon icon={faTrash}/>
                        </span>
                        Uninstall App
                    </MenuItem>
                </Menu>
            </>}
        </div>
        
        {isViewingCargo && !cargoFound ? <div>
            <span className="mx-1">
                <FontAwesomeIcon icon={faAngleRight}/>
            </span>
            <button
                className="hover:bg-gray-900 p-1 px-2 rounded text-yellow-500"
            >
                {"Not found"}
            </button>
        </div> : <></>}

        {isViewingCargo && cargoFound && targetCargo ? <>
            {directoryPath.map((pathSection, index) => {
                const {path} = pathSection
                return <div
                    key={`path-section-${index}`}
                    className="flex items-center"
                >
                    <div>
                        <span className="mx-1">
                            <FontAwesomeIcon 
                                icon={faAngleRight}
                            />
                        </span>
                    </div>

                    <div>
                        <button
                            className="hover:bg-gray-900 py-1 px-2 rounded"
                            onClick={(event) => {
                                if (index < directoryPath.length - 1) {
                                    mutateDirectoryPath(directoryPath.slice(0, index + 1))
                                    return
                                } else {
                                    setCargoMenuElement(event.currentTarget)
                                }
                            }}
                        >
                            <div className="flex items-center">
                                {path === ROOT_DIRECTORY_PATH && targetCargo.logoUrl !== CARGO_NULL_FIELD ? <div
                                    className="mr-1"
                                >
                                    <CargoIcon 
                                        importUrl={targetCargo.resolvedUrl}
                                        crateLogoUrl={targetCargo.logoUrl}
                                        pixels={17}
                                        className="animate-fade-in-left"
                                    />
                                </div> : <></>}
                                <div>
                                    {path === ROOT_DIRECTORY_PATH 
                                        ? targetCargo.name
                                        : path
                                    }
                                    {index === directoryPath.length - 1 ? <>
                                        <span className="ml-2">
                                            <FontAwesomeIcon 
                                                icon={faCaretDown}
                                            />
                                        </span>
                                    </> : <></>}
                                </div>
                            </div>
                            
                        </button>
                    </div>

                    <Menu
                        anchorEl={cargoMenuElement}
                        open={!!cargoMenuElement}
                        onClose={() => setCargoMenuElement(null)}
                    >
                        <MenuItem
                            className="hover:text-green-500"
                            onClick={() => {
                                onShowCargoInfo()
                                setCargoMenuElement(null)
                            }}
                        >
                            <span className="mr-3">
                                <FontAwesomeIcon icon={faInfoCircle}/>
                            </span>
                            Info
                        </MenuItem>

                        <MenuItem
                            className="hover:text-blue-500"
                            disabled={targetCargo.state === "updating"}
                            onClick={() => {
                                onShowCargoUpdater()
                                setCargoMenuElement(null)
                            }}
                        >
                            <span className="mr-2.5">
                                <FontAwesomeIcon icon={faRotate} />
                            </span>
                            Update
                        </MenuItem>

                        <MenuItem
                            className="hover:text-yellow-500"
                            disabled={targetCargo.entry === NULL_FIELD}
                            onClick={async () => {
                                const confirmed = await confirm({title: "Are you sure you want to run this add-on?", confirmButtonColor: "warning"})
                                setCargoMenuElement(null)
                                if (!confirmed) {
                                    return
                                }
                                navigate(`/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(targetCargo.canonicalUrl)}`)
                            }}
                        >
                            <span className="ml-0.5 mr-3">
                                <FontAwesomeIcon icon={faPlay}/>
                            </span>
                            Run
                        </MenuItem>

                        <MenuItem
                            disabled={isStandardCargo(targetCargo)}
                            className={isStandardCargo(targetCargo) ? "" : "hover:text-red-500"}
                            onClick={async () => {
                                const target = targetCargo
                                if (!await confirm({title: `Are you sure you want to delete this add-on?`, confirmButtonColor: "error"})) {
                                    setCargoMenuElement(null)
                                    return
                                }
                                onDeleteCargo(target.canonicalUrl)
                                setCargoMenuElement(null)
                            }}
                        >
                            <span className="mr-3">
                                <FontAwesomeIcon icon={faTrash} />
                            </span>
                            Delete
                        </MenuItem>
                    </Menu>
                </div>
            })}
        </> : <></>}
    </div>
}