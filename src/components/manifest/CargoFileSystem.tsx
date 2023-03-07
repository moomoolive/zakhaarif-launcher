import {HuzmaManifest} from "huzma"
import {ManifestIndex, Shabah} from "../../lib/shabah/downloadClient"
import {Permissions} from "../../lib/types/permissions"
import {useEffect, useMemo, useRef, useState} from "react"
import {Tooltip, Button} from "@mui/material"
import {readableByteCount} from "../../lib/utils/storage/friendlyBytes"
import {reactiveDate} from "../../lib/utils/dates"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {faFolder, faFolderTree, faPuzzlePiece} from "@fortawesome/free-solid-svg-icons"
import { useGlobalConfirm } from "../../hooks/globalConfirm"
import {urlToMime, Mime} from "../../lib/miniMime"
import {useAppContext} from "../../routes/store"
import {MimeIcon} from "./MimeIcon"
import type {FilterOrder} from "../FilterChevron"
import { useDebounce } from "../../hooks/debounce"
import {CargoFileSystemSkeleton} from "./CargoFileSystemSkeleton"
import { removeZipExtension } from "../../lib/utils/urls/removeZipExtension"

type FileSystemMemberProps = {
    onClick: () => void | Promise<void>
    icon: JSX.Element
    name: string
    type: string
    updatedAt: number
    byteCount: number
}

const FileSystemMember = ({
    onClick, 
    icon, 
    name,
    type,
    updatedAt,
    byteCount,
}: FileSystemMemberProps) => {
    const friendlyBytes = readableByteCount(byteCount)

    return <button
        className="p-4 w-full text-left flex justify-center items-center hover:bg-neutral-900"
        onClick={onClick}
    >
        
        <div className={`relative z-0 w-1/2 whitespace-nowrap text-ellipsis overflow-clip`}>
            {icon}
            {name}
        </div>

        
        <Tooltip title={type}>
            <div className={`w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip`}>
                {type}
            </div>
        </Tooltip>
        
        
        <div className={`hidden md:block w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip`}>
            {reactiveDate(new Date(updatedAt))}
        </div>
        
        <div className="w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
            {`${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`}
        </div>
    </button>
}

export type FileMetadata = {name: string, bytes: number}

export type CargoDirectory = {
    path: string,
    contentBytes: number
    files: FileMetadata[]
    directories: CargoDirectory[]
}

const addFileToDirectory = (
    directory: CargoDirectory,
    file: Readonly<FileMetadata>
) => {
    const splitPath = file.name.split("/")
    if (splitPath.length < 0) {
        return 
    }
    const isFile = splitPath.length === 1
    const {bytes} = file
    if (isFile) {
        const name = removeZipExtension(splitPath.at(-1)!)
        directory.files.push({name, bytes})
        return
    }
    const [nextPath] = splitPath
    const directoryIndex = directory.directories.findIndex(
        (directory) => directory.path === nextPath
    )
    const name = splitPath.slice(1).join("/")
    if (directoryIndex > -1) {
        const targetDirectory = directory.directories[directoryIndex]
        addFileToDirectory(targetDirectory, {name, bytes})
        return 
    }
    const targetDirectory: CargoDirectory = {
        path: nextPath,
        contentBytes: 0,
        files: [],
        directories: []
    }
    directory.directories.push(targetDirectory)
    addFileToDirectory(targetDirectory, {name, bytes})
}

const calculateDirectorySize = (directory: CargoDirectory) => {
    let sizeOfFilesInDirectory = 0
    for (let i = 0; i < directory.files.length; i++) {
        sizeOfFilesInDirectory += directory.files[i].bytes
    }
    if (directory.directories.length < 1) {
        directory.contentBytes = sizeOfFilesInDirectory
        return
    }
    for (let i = 0; i < directory.directories.length; i++) {
        const target = directory.directories[i]
        calculateDirectorySize(target)
    }
    let sizeOfFoldersInDirectory = 0
    for (let i = 0; i < directory.directories.length; i++) {
        const target = directory.directories[i]
        sizeOfFoldersInDirectory += target.contentBytes
    }
    directory.contentBytes = sizeOfFilesInDirectory + sizeOfFoldersInDirectory
}

export type FileDetails = {
    name: string;
    mime: Mime;
    url: string;
    fileResponse: Response;
    bytes: number;
}

const ROOT_DIRECTORY_PATH = "#"

export type RootDirectoryPath = typeof ROOT_DIRECTORY_PATH

const cleanDirectory = (): CargoDirectory => {
    return {
        path: ROOT_DIRECTORY_PATH,
        contentBytes: 0,
        files: [],
        directories: []
    }
}

export type CargoFileSystemProps = {
    cargoIndex: ManifestIndex | null
    cargo: HuzmaManifest<Permissions>
    cargoBytes: number
    searchText: string
    lastPackageUpdate: number
    totalStorageBytes: number
    filter: {type: string, order: FilterOrder}
    directoryPath: CargoDirectory[]
    onOpenFileModal: (details: FileDetails) => void
    onBackToCargos: () => void
    mutateDirectoryPath: (newValue: CargoDirectory[]) => unknown
}

export const CargoFileSystem = ({
    cargoIndex, 
    cargo,
    cargoBytes,
    searchText,
    lastPackageUpdate,
    totalStorageBytes,
    filter,
    directoryPath,
    onOpenFileModal,
    onBackToCargos,
    mutateDirectoryPath
}: CargoFileSystemProps): JSX.Element => {
    const confirm = useGlobalConfirm()
    const {downloadClient, logger} = useAppContext()
    const createFileSystemDelay = useDebounce(700)

    const [creatingFileSystem, setCreatingFileSystem] = useState(true)

    const rootDir = useRef(cleanDirectory())
    const {current: fileSystemRoot} = rootDir

    useEffect(() => {
        createFileSystemDelay(() => setCreatingFileSystem(false))
        if (!cargoIndex || cargo.files.length < 1) {
            return
        }
        const rootDirectory = cleanDirectory()
        for (let i = 0; i < cargo.files.length; i++) {
            const {name, bytes} = cargo.files[i]
            addFileToDirectory(rootDirectory, {name, bytes})
        }

        rootDirectory.files.push({
            name: cargoIndex.manifestName,
            bytes: cargoBytes
        })
        calculateDirectorySize(rootDirectory)
        mutateDirectoryPath([rootDirectory])
        rootDir.current = rootDirectory
    }, [cargoIndex])

    const filteredDirectory = useMemo(() => {
        if (directoryPath.length < 1) {
            return fileSystemRoot
        }
        const viewingDirectory = directoryPath[directoryPath.length - 1]
        const directory = {...viewingDirectory}
        
        if (searchText.length > 0) {
            directory.files = directory.files.filter(
                (file) => file.name.includes(searchText)
            )
            directory.directories = directory.directories.filter(
                (directory) => directory.path.includes(searchText)
            )
        }

        const {type, order} = filter
        const orderFactor = order
        switch (type) {
            case "bytes":
                directory.directories.sort((a, b) => {
                    const order = a.contentBytes > b.contentBytes ? 1 : -1
                    return order * orderFactor
                })
                directory.files.sort((a, b) => {
                    const order = a.bytes > b.bytes ? 1 : -1
                    return order * orderFactor
                })
                break 
            case "name":
                directory.directories.sort((a, b) => {
                    const order = a.path.localeCompare(b.path)
                    return order * -1 * orderFactor
                })
                directory.files.sort((a, b) => {
                    const order = a.name.localeCompare(b.name)
                    return order * -1 * orderFactor
                })
                break
            default:
                break
        }
        return directory
    }, [filter, searchText, directoryPath])

    const parentPathname = useMemo(() => {
        if (directoryPath.length < 2) {
            return "My Add-ons"
        }
        const lastPath = directoryPath[directoryPath.length - 2]
        if (lastPath.path === ROOT_DIRECTORY_PATH) {
            return cargo.name
        }
        return lastPath.path
    }, [directoryPath])

    if (creatingFileSystem) {
        return CargoFileSystemSkeleton
    }

    if (!cargoIndex) {
        return <div className="w-full h-5/6 overflow-y-scroll text-center">
            <div className="text-yellow-500 mt-16 mb-3">
                <span className="mr-2">
                    <FontAwesomeIcon icon={faPuzzlePiece}/>
                </span>
                {"Add-on not found"}
            </div>

            <div>
                <Button onClick={onBackToCargos} size="large">
                    Back
                </Button>
            </div>
        </div>
    }

    if (fileSystemRoot.files.length < 1 && fileSystemRoot.directories.length < 1) {
        return <div className="w-full h-5/6 overflow-y-scroll text-center">
            <div className="text-yellow-500 mt-16 mb-3">
                <span className="mr-2">
                    <FontAwesomeIcon icon={faPuzzlePiece}/>
                </span>
                {"No content found"}
            </div>
            
            <div>
                <Button onClick={onBackToCargos} size="large">
                    Back
                </Button>
            </div>
        </div>
    }

    return <div className="w-full h-5/6 overflow-y-scroll text-center">        
        <Tooltip 
            title="Back To Parent Folder" 
            placement="top"
        >
            <div>
                <FileSystemMember 
                    onClick={() => {
                        if (directoryPath.length < 2) {
                            onBackToCargos()
                        } else {
                            mutateDirectoryPath(directoryPath.slice(0, -1))
                        }
                    }}
                    icon={<span className={"mr-3 text-amber-300"}>
                        <FontAwesomeIcon icon={faFolderTree} />
                    </span>}
                    name={parentPathname}
                    type="parent folder"
                    updatedAt={directoryPath.length < 2  ? lastPackageUpdate : cargoIndex.updated}
                    byteCount={directoryPath.length < 2 ? totalStorageBytes : directoryPath[directoryPath.length - 2].contentBytes}
                />
            </div>
        </Tooltip>
        
        {filteredDirectory.directories.map((directory, index) => {
            return <FileSystemMember
                key={`cargo-directory-${index}`}
                onClick={() => {
                    mutateDirectoryPath([...directoryPath, directory]) 
                }}
                icon={<span className={"mr-3 text-amber-300"}>
                    <FontAwesomeIcon icon={faFolder}/>
                </span>
                }
                name={directory.path}
                type="folder"
                updatedAt={cargoIndex.updated}
                byteCount={directory.contentBytes}
            />
        })}

        {filteredDirectory.files.map((file, index) => {
            const mime = urlToMime(file.name) || "text/plain"
            return <FileSystemMember
                key={`cargo-file-${index}`}
                onClick={async () => {
                    const basePath = cargoIndex.resolvedUrl
                    const path = directoryPath.slice(1).reduce(
                        (total, next) => `/${total}${next.path}`, 
                        ""
                    )
                    const cleanedBase = basePath.endsWith("/") 
                        ? basePath.slice(0, -1) 
                        : basePath
                    const cleanedPathEnd = path.endsWith("/")
                        ? path.slice(0, -1) 
                        : path
                    const cleanedPath = cleanedPathEnd.startsWith("/")
                        ? path.slice(1)
                        : cleanedPathEnd
                    const fullPath = `${cleanedBase}/${directoryPath.length > 1 ? cleanedPath + "/" : cleanedPath}${file.name}`
                    let fileResponse = await downloadClient.getCachedFile(fullPath)
                    if (!fileResponse || !fileResponse.ok) {
                        const networkResponse = await fetch(fullPath, {
                            method: "GET",
                            headers: Shabah.POLICIES.networkFirst
                        })
                        if (!networkResponse || !networkResponse.ok) {
                            logger.warn(`file ${fullPath} was not found although it should be cached!`)
                            await confirm({title: "Could not find file!"})
                            return
                        }
                        fileResponse = networkResponse
                    }
                    onOpenFileModal({
                        name: file.name,
                        mime,
                        url: fullPath,
                        fileResponse,
                        bytes: file.bytes,
                    })
                }}
                icon={<MimeIcon
                    filename={file.name} 
                    mime={mime} 
                    className="mr-3"
                />}
                name={file.name}
                type={mime}
                updatedAt={cargoIndex.updated}
                byteCount={file.bytes}
            />
        })}
    </div>
}