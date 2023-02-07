import { Cargo } from "../../lib/cargo"
import type {CargoIndex} from "../../lib/shabah/downloadClient"
import { Permissions } from "../../lib/types/permissions"
import {useMemo, useState} from "react"
import { MANIFEST_NAME } from "../../lib/cargo"
import {Tooltip, Button} from "@mui/material"
import {readableByteCount} from "../../lib/utils/storage/friendlyBytes"
import {reactiveDate} from "../../lib/utils/dates"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {faFolder, faFolderTree, faPuzzlePiece} from "@fortawesome/free-solid-svg-icons"
import { useGlobalConfirm } from "../../hooks/globalConfirm"
import {urlToMime, Mime} from "../../lib/miniMime"
import {useAppShellContext} from "../../routes/store"
import {MimeIcon} from "./MimeIcon"
import type {FilterOrder} from "../FilterChevron"

type FileSystemItem = {
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
}: FileSystemItem) => {
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

type FileMetadata = {name: string, bytes: number}

type CargoDirectory = {
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
        const name = splitPath.at(-1)!
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

export type CargoFileSystemProps = {
    cargoIndex: CargoIndex
    cargo: Cargo<Permissions>
    cargoBytes: number
    searchText: string
    lastPackageUpdate: number
    totalStorageBytes: number
    order: FilterOrder
    filter: string
    onOpenFileModal: (details: FileDetails) => void
    onBackToPackages: () => void
}

export const CargoFileSystem = ({
    cargoIndex, 
    cargo,
    cargoBytes,
    searchText,
    lastPackageUpdate,
    totalStorageBytes,
    filter,
    order,
    onOpenFileModal,
    onBackToPackages
}: CargoFileSystemProps): JSX.Element => {
    const confirm = useGlobalConfirm()
    const {downloadClient} = useAppShellContext()

    const [directoryPath, setDirectoryPath] = useState<CargoDirectory[]>([])

    const fileSystemRoot = useMemo(() => {
        const cargoTarget = cargo
        const rootDirectory: CargoDirectory = {
            path: ROOT_DIRECTORY_PATH,
            contentBytes: 0,
            files: [],
            directories: []
        }
        for (let i = 0; i < cargoTarget.files.length; i++) {
            const {name, bytes} = cargoTarget.files[i]
            addFileToDirectory(rootDirectory, {name, bytes})
        }
        rootDirectory.files.push({
            name: MANIFEST_NAME,
            bytes: cargoBytes
        })
        calculateDirectorySize(rootDirectory)
        return rootDirectory
    }, [])

    const filteredDirectory = useMemo(() => {
        const viewingDirectory = directoryPath.length < 1 
            ? fileSystemRoot
            : directoryPath[directoryPath.length - 1]
        const directory = {...viewingDirectory}
        
        if (searchText.length > 0) {
            directory.files = directory.files.filter(
                (file) => file.name.includes(searchText)
            )
            directory.directories = directory.directories.filter(
                (directory) => directory.path.includes(searchText)
            )
        }

        const orderFactor = order === "ascending" ? 1 : -1
        switch (filter) {
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
                    return order * orderFactor
                })
                directory.files.sort((a, b) => {
                    const order = a.name.localeCompare(b.name)
                    return order * orderFactor
                })
                break
            default:
                break
        }

        return directory
    }, [filter, order, searchText, directoryPath])

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

    return <div className="w-full h-5/6 overflow-y-scroll text-center animate-fade-in-left">
        {fileSystemRoot.files.length < 1 && fileSystemRoot.directories.length < 1 ? <>
            <div className="text-yellow-500 mt-16 mb-3">
                <span className="mr-2">
                    <FontAwesomeIcon icon={faPuzzlePiece}/>
                </span>
                {"No content found"}
            </div>
            <div>
                <Button onClick={onBackToPackages} size="large">
                    Back
                </Button>
            </div>
        </> : <>
            <Tooltip 
                title="Back To Parent Folder" 
                placement="top"
            >
                <div>
                    <FileSystemMember 
                        onClick={() => {
                            if (directoryPath.length < 2) {
                                onBackToPackages()
                            } else {
                                setDirectoryPath(directoryPath.slice(0, -1))
                            }
                        }}
                        icon={<span className={"mr-3 text-amber-300"}>
                            <FontAwesomeIcon icon={faFolderTree} />
                        </span>}
                        name={parentPathname}
                        type="parent folder"
                        updatedAt={directoryPath.length < 2  ? lastPackageUpdate : cargoIndex.updatedAt}
                        byteCount={directoryPath.length < 2 ? totalStorageBytes : directoryPath[directoryPath.length - 2].contentBytes}
                    />
                </div>
            </Tooltip>
            
            {filteredDirectory.directories.map((directory, index) => {
                return <FileSystemMember
                    key={`cargo-directory-${index}`}
                    onClick={() => setDirectoryPath([...directoryPath, directory])}
                    icon={<span className={"mr-3 text-amber-300"}>
                        <FontAwesomeIcon icon={faFolder}/>
                    </span>
                    }
                    name={directory.path}
                    type="folder"
                    updatedAt={cargoIndex.updatedAt}
                    byteCount={directory.contentBytes}
                />
            })}

            {filteredDirectory.files.map((file, index) => {
                const mime = urlToMime(file.name) || "text/plain"
                return <FileSystemMember
                    key={`cargo-file-${index}`}
                    onClick={async () => {
                        const basePath = cargoIndex.resolvedUrl
                        const path = directoryPath.reduce(
                            (total, next) => `${total}${next.path}/`, 
                            "/"
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
                        const fileResponse = await downloadClient.getCachedFile(fullPath)
                        if (!fileResponse) {
                            console.error(`file ${fullPath} was not found although it should be cached!`)
                            await confirm({title: "An error occurred when fetching file!"})
                            return
                        }
                        onOpenFileModal({
                            name: file.name,
                            mime,
                            url: fullPath,
                            fileResponse,
                            bytes: file.bytes,
                        })
                    }}
                    icon={<MimeIcon mime={mime} className="mr-3"/>}
                    name={file.name}
                    type={mime}
                    updatedAt={cargoIndex.updatedAt}
                    byteCount={file.bytes}
                />
            })}
        </>}
    </div>
}