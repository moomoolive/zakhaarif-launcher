import { 
    IconButton, 
    Tooltip, 
    Button,
    Divider,
} from "@mui/material"
import { ReactNode, useEffect, useMemo, useState } from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faArrowLeft, 
    faPlus, 
    faXmark, 
    faInfo,
    faFaceSadCry
} from "@fortawesome/free-solid-svg-icons"
import {useNavigate} from "react-router-dom"
import {useGlobalConfirm} from "../../hooks/globalConfirm"
import {useAppShellContext} from "../../routes/store"
import {CargoIndices} from "../../lib/shabah/downloadClient"
import {useEffectAsync} from "../../hooks/effectAsync"
import {STANDARD_MOD_CARGO} from "../../standardCargos"
import {NUMBER_OF_STANDARD_MODS, STANDARD_MOD_ID} from "../../config"
import type {CargoIndex} from "../../lib/shabah/downloadClient"
import {Cargo, NULL_MANIFEST_VERSION} from "../../lib/cargo/index"

type LinkableModProps = {
    mod: CargoIndex
    actionIcon: ReactNode
}

const LinkableMod = ({mod, actionIcon}: LinkableModProps) => {
    const {downloadClient} = useAppShellContext()
    
    const [showInfo, setShowInfo] = useState(false)
    const [modCargo, setModCargo] = useState(
        mod.id === STANDARD_MOD_ID
            ? STANDARD_MOD_CARGO
            : new Cargo()
    )
    const [cargoError, setCargoError] = useState(false)

    useEffectAsync(async () => {
        if (!showInfo) {
            return
        }
        if (modCargo.version !== NULL_MANIFEST_VERSION) {
            return
        }
        const cargoResponse = await downloadClient.getCargoAtUrl(
            mod.resolvedUrl
        )
        if (!cargoResponse.ok) {
            setCargoError(true)
            return
        }
        setCargoError(false)
        setModCargo(cargoResponse.data.pkg)
    }, [showInfo])

    return <div className="w-full">
        <div className="px-2 py-1 w-full flex items-center text-sm rounded text-neutral-200 hover:bg-neutral-900/50">
            <Tooltip title={mod.name}>
                <div className="w-7/12 sm:w-8/12 whitespace-nowrap text-ellipsis overflow-clip">
                    {mod.name}
                </div>
            </Tooltip>

            <Tooltip title={`Version ${mod.version}`}>
                <div className="text-neutral-400 w-2/12 sm:w-1/12 whitespace-nowrap text-ellipsis overflow-clip">
                    {"v" + mod.version}
                </div>
            </Tooltip>
            <div className="w-3/12 flex justify-end items-center">
                <div>
                    <Tooltip title="Info">
                        <button
                            className="text-blue-500 mr-6"
                            onClick={() => setShowInfo(!showInfo)}
                        >
                            <FontAwesomeIcon icon={faInfo}/>
                        </button>
                    </Tooltip>
                </div>

                <div>
                    {actionIcon}
                </div>
            </div>
        </div>
        {showInfo ?  <div 
            className="w-full px-2 py-1 animate-fade-in-left"
        >
            {cargoError ? <>
                <div className="text-red-500">
                    Error Occurred
                </div>
            </> : <>
                <button 
                    className="mb-2 text-sm w-full py-2 text-red-400 bg-neutral-700 rounded hover:bg-neutral-900/50"
                    onClick={() => setShowInfo(false)}
                >
                    Close
                </button>
                <div className="text-neutral-300 text-sm max-h-16 overflow-x-clip overflow-y-scroll text-ellipsis">
                    <div className="mb-2">
                        {modCargo.description}
                    </div>

                    <div className="text-xs text-blue-500">
                        {"v" + mod.version}
                    </div>

                    <div className="text-xs text-neutral-400">
                        {`Updated @ ${new Date(mod.updatedAt).toLocaleString("en-us", {
                            day: "numeric",
                            year: "numeric",
                            month: "short"
                        })}`}
                    </div>
                </div>
            </>}
        </div> : <></>}
    </div>
}

export type ModLinkerProps = {
    onClose: () => void
    modIndexes: CargoIndices
    linkedMods: CargoIndex[]
    setLinkedMods: (newMods: CargoIndex[]) => void
}

export const ModLinker = ({
    onClose,
    modIndexes,
    linkedMods,
    setLinkedMods
}: ModLinkerProps) => {
    const confirm = useGlobalConfirm()
    const navigate = useNavigate()
    
    useEffect(() => {
        const listener = (event: KeyboardEvent) => {
            const {key} = event
            if (key.toLowerCase() === "escape") {
                onClose()
            }
        }
        window.addEventListener("keyup", listener)
        return () => window.removeEventListener("keyup", listener)
    }, [])

    const unlinkedMods = useMemo(() => {
        const linkMap = new Map<string, number>()
        for (let index = 0; index < linkedMods.length; index++) {
            const element = linkedMods[index]
            linkMap.set(element.id, 1)
        }
        const allMods = modIndexes.cargos
        const unlinked = []
        for (let index = 0; index < allMods.length; index++) {
            const element = allMods[index]
            if (linkMap.has(element.id)) {
                continue
            }
            unlinked.push({...element})
        }
        return unlinked
    }, [linkedMods])

    return <div
        className="animate-fade-in-left w-screen h-screen z-10 fixed top-0 left-0 flex items-center justify-center bg-neutral-900/80"
    >
        <div className="absolute top-0 left-0">
            <div className="mt-2 ml-2">
                <Tooltip title="Close">
                    <IconButton onClick={onClose}>
                        <FontAwesomeIcon icon={faArrowLeft}/>
                    </IconButton>
                </Tooltip>
            </div>
        </div>
        
        <div className="w-5/6 max-w-xl bg-neutral-800 rounded p-3 overflow-clip">
            <div className="mb-4">
                <div className="text-green-500 text-xs mb-1">
                    {"Linked"}
                </div>
                <div className="max-h-40 overflow-y-scroll">
                    {linkedMods.length < 1 ? <>
                        <div className="w-full py-2 text-center text-sm text-neutral-400">
                            <span className="mr-2 text-yellow-500">
                                <FontAwesomeIcon icon={faFaceSadCry}/>
                            </span>
                            {"No Mods Linked"}
                        </div>
                    </> : <>
                        <div>
                            <Divider className="bg-neutral-600"/>
                        </div>
                        <div className="w-full flex flex-wrap">
                            {linkedMods.map((mod, index) => {
                                return <div 
                                    className="w-full"
                                    key={`linked-mod-${index}`}
                                >
                                    <LinkableMod 
                                        mod={mod}
                                        actionIcon={
                                            <Tooltip title="Unlink">
                                                <button
                                                    className="text-red-500 pt-1 text-base"
                                                    onClick={() => {
                                                        if (mod.id === STANDARD_MOD_ID) {
                                                            confirm({title: `Mod "${mod.name}" cannot be unlinked!`})
                                                            return
                                                        }
                                                        const copy = [...linkedMods]
                                                        copy.splice(index, 1)
                                                        setLinkedMods(copy)
                                                    }}
                                                >
                                                    <FontAwesomeIcon icon={faXmark}/>
                                                </button>
                                            </Tooltip>
                                        }
                                    />
                                    <div>
                                        <Divider className="bg-neutral-600"/>
                                    </div>
                                </div> 
                            })}
                        </div>
                    </>}
                </div>
            </div>

            <div>
                <div className="text-blue-500 text-xs mb-1">
                    {"Unlinked"}
                </div>
                <div className="max-h-40 overflow-y-scroll">
                    {unlinkedMods.length < 1 ? <>
                        <div className="w-full py-2 text-center text-sm text-neutral-400">
                            <span className="mr-2 text-yellow-500">
                                <FontAwesomeIcon icon={faFaceSadCry}/>
                            </span>
                            {"No Mods to Link"}
                        </div>
                        {linkedMods.length <= NUMBER_OF_STANDARD_MODS ? <>
                            <div>
                                <Button 
                                    size="small"
                                    fullWidth
                                    onClick={async () => {
                                        if (!await confirm({title: "Are you sure you want to leave this page?"})) {
                                            return
                                        }
                                        navigate("/add-ons")
                                    }}
                                >
                                    {"Add Some"}
                                </Button>
                            </div>
                        </> : <></>}
                    </> : <>
                        <div>
                            <Divider className="bg-neutral-600"/>
                        </div>
                        <div className="w-full flex flex-wrap">
                            {unlinkedMods.map((mod, index) => {
                                return <div 
                                    className="w-full"
                                    key={`linked-mod-${index}`}
                                >
                                    <LinkableMod 
                                        mod={mod}
                                        actionIcon={
                                            <Tooltip title="Link">
                                                <button
                                                    className="text-green-500 pt-1 text-base"
                                                    onClick={() => setLinkedMods([...linkedMods, mod])}
                                                >
                                                    <FontAwesomeIcon icon={faPlus}/>
                                                </button>
                                            </Tooltip>
                                        }
                                    />
                                    <div>
                                        <Divider className="bg-neutral-600"/>
                                    </div>
                                </div> 
                            })}
                        </div>
                    </>}
                </div>
            </div>
        </div>
    </div>
}