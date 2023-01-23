import { FullScreenLoadingOverlay } from "@/components/LoadingOverlay"
import { useEffectAsync } from "@/hooks/effectAsync"
import { useMemo, useRef, useState } from "react"
import {AppDatabase, GameSave} from "../lib/database/AppDatabase"
import { BackNavigationButton } from "@/components/navigation/BackNavigationButton"
import { faFloppyDisk, faRobot, faBolt, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {Button, Tooltip} from "@mui/material"
import { useGlobalConfirm } from "@/hooks/globalConfirm"
import { ModLinker } from "@/components/mods/ModLinker"
import { useAppShellContext } from "./store"
import { emptyCargoIndices } from "@/lib/shabah/backend"
import { addStandardCargosToCargoIndexes } from "@/standardCargos"
import { MOD_CARGO_ID_PREFIX } from "@/config"
import { SAVE_EXISTS } from "@/lib/utils/localStorageKeys"
import { FilterChevron, FilterOrder } from "@/components/FilterChevron"

const DO_NOT_SHOW_LINKER = -1

const SAVE_FILTERS = ["updatedAt", "name", "type"] as const

const gameSaveTypeToNumber = (type: GameSave["type"]) => {
    switch (type) {
        case "quick":
            return 2
        case "auto":
            return 1
        case "manual":
        default:
            return 0
    }
}

const LoadGamePage = () => {
    const {current: appDatabase} = useRef(new AppDatabase())
    const {downloadClient} = useAppShellContext()
    const confirm = useGlobalConfirm()

    const [loading, setLoading] = useState(true)
    const [saves, setSaves] = useState([] as GameSave[])
    const [modIndexes, setModIndexes] = useState(emptyCargoIndices())
    const [modLinkerSaveId, setModLinkerSaveId] = useState(
        DO_NOT_SHOW_LINKER
    )
    const [currentFilter, setCurrentFilter] = useState<typeof SAVE_FILTERS[number]>("updatedAt")
    const [order, setOrder] = useState<FilterOrder>("descending")

    const filteredSaves = useMemo(() => {
        const savesList = [...saves]
        const orderFactor = order === "ascending" ? 1 : -1
        switch (currentFilter) {
            case "type":
                return savesList.sort((a, b) => {
                    const ratingA = gameSaveTypeToNumber(a.type)
                    const ratingB = gameSaveTypeToNumber(b.type)
                    const order = ratingA > ratingB ? 1 : -1
                    return order * orderFactor
                })
            case "name":
                return savesList.sort((a, b) => {
                    return a.name.localeCompare(b.name) * orderFactor
                })
            case "updatedAt":
            default:
                return savesList.sort((a, b) => {
                    const order = a.updatedAt > b.updatedAt ? 1 : -1
                    return order * orderFactor
                })
        }
    }, [saves, currentFilter, order])

    const modMap = useMemo(() => {
        const map = new Map<string, number>()
        for (let index = 0; index < modIndexes.cargos.length; index++) {
            const element = modIndexes.cargos[index]
            map.set(element.canonicalUrl, index)
        }
        return map
    }, [modIndexes])

    const linkedMods = useMemo(() => {
        if (modLinkerSaveId === DO_NOT_SHOW_LINKER) {
            return []
        }
        const linked = []
        const saveIndex = saves.findIndex((save) => save.id === modLinkerSaveId)
        if (saveIndex < 0) {
            return []
        }
        const targetMod = saves[saveIndex]
        for (let index = 0; index < targetMod.mods.canonicalUrls.length; index++) {
            const element = targetMod.mods.canonicalUrls[index]
            if (!modMap.has(element)) {
                continue
            }
            const targetModIndex = modMap.get(element) || 0
            const mod = modIndexes.cargos[targetModIndex]
            linked.push({...mod})
        }
        return linked
    }, [modLinkerSaveId, modMap, saves])

    const deleteSave = async (id: number) => {
        if (!await confirm({title: "Are you sure you want to delete this save?"})) {
            return
        }
        const index = saves.findIndex((save) => save.id === id)
        if (index < 0) {
            return
        }
        appDatabase.gameSaves.deleteById(id)
        const copy = [...saves]
        copy.splice(index, 1)
        if (copy.length < 1) {
            window.localStorage.removeItem(SAVE_EXISTS)
        }
        setSaves(copy)
    }

    const toggleFilter = (filterName: typeof currentFilter) => {
        if (currentFilter !== filterName) {
            setCurrentFilter(filterName)
            setOrder("descending")
        } else if (order === "descending") {
            setOrder("ascending")
        } else {
            setOrder("descending")
        }
    }

    useEffectAsync(async () => {
        const [saves, cargoIndexesResponse] = await Promise.all([
            appDatabase.gameSaves.getAll(),
            downloadClient.getCargoIndices()
        ] as const)
        setSaves(saves)
        const allCargos = addStandardCargosToCargoIndexes(cargoIndexesResponse.cargos)
        const cargos = allCargos.filter((cargo) => cargo.id.startsWith(MOD_CARGO_ID_PREFIX))
        setModIndexes({...cargoIndexesResponse, cargos})
        setLoading(false)
    }, [])

    return <FullScreenLoadingOverlay loading={loading}>
        <div className="w-screen h-screen fixed z-0 flex items-center justify-center">
            <BackNavigationButton/>

            {modLinkerSaveId !== DO_NOT_SHOW_LINKER ? <>
                <ModLinker 
                    modIndexes={modIndexes}
                    linkedMods={linkedMods}
                    setLinkedMods={async (linked) => {
                        const saveIndex = saves.findIndex((save) => save.id === modLinkerSaveId)
                        const copy = [...saves]
                        const newSave = {
                            ...saves[saveIndex],
                            mods: {
                                canonicalUrls: linked.map((cargo) => cargo.canonicalUrl),
                                entryUrls: linked.map((cargo) => cargo.entry)
                            }
                        } as const
                        appDatabase.gameSaves.updateOne(
                            saves[saveIndex].id, newSave
                        )
                        copy.splice(saveIndex, 1, newSave)
                        setSaves(copy)
                    }}
                    onClose={() => setModLinkerSaveId(DO_NOT_SHOW_LINKER)}
                />
            </> : <></>}

            <div className="w-full h-full overflow-clip">
                {saves.length < 1 ? <div
                    className="w-full h-full flex items-center justify-center"
                >
                    <div className="text-center text-xl">
                        <div className="mb-3 text-yellow-500 text-4xl">
                            <FontAwesomeIcon icon={faFloppyDisk}/>
                        </div>
                        {"No Saves Found..."}
                    </div>
                </div> : <>
                    <div className="w-full h-full max-w-4xl mx-auto">
                        <div className="w-full mt-14 mb-3 px-2">
                            {([
                                {text: "Modified", key: "updatedAt"},
                                {text: "Name", key: "name"},
                                {text: "Type", key: "type"},
                            ] as const).map((data, index) => {
                                return <button
                                    className="hover:bg-neutral-900 rounded px-2 py-1 mr-2"
                                    onClick={() => toggleFilter(data.key)}
                                    key={`filter-button-${index}`}
                                >
                                    {data.text}
                                    <FilterChevron
                                        currentFilter={currentFilter}
                                        targetFilter={data.key}
                                        order={order}
                                        className="ml-2 text-blue-500"
                                    />
                                </button>
                            })}
                        </div>

                        <div className="w-full h-5/6 overflow-y-scroll overflow-x-clip px-2">
                            {filteredSaves.map((save, index) => {
                                const {name, type, updatedAt, id} = save
                                return <div
                                    key={`save-${index}`}
                                    className="w-full text-left bg-neutral-900 cursor-pointer hover:bg-neutral-900/60 mb-2 rounded shadow-2xl border-l-4 border-solid border-blue-500"
                                >
                                    <div className="w-full flex items-center pt-2 px-2">
                                        <div className="w-3/4 overflow-x-clip break-words">
                                            {name}
                                        </div>
                                        <div className="w-1/4 text-right">
                                            <div className="text-xs text-neutral-400">
                                                {type}
                                                {((saveType: typeof type) => {
                                                    switch (saveType) {
                                                        case "quick":
                                                            return <span className="text-yellow-500 ml-1.5">
                                                                <FontAwesomeIcon icon={faBolt}/>
                                                            </span>
                                                        case "auto":
                                                            return <span className="text-indigo-500 ml-1.5">
                                                                <FontAwesomeIcon icon={faRobot}/>
                                                            </span>
                                                        default:
                                                            return <span className="text-blue-500 ml-2">
                                                                <FontAwesomeIcon icon={faFloppyDisk}/>
                                                            </span>
                                                            
                                                    }
                                                })(type)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-full py-2 px-2 text-xs text-neutral-500 flex items-center">
                                        <div className="w-1/2">
                                            {new Date(updatedAt).toLocaleString("en-us", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                                second: "2-digit"
                                            })}
                                        </div>

                                        <div className="w-1/2 text-right">
                                            <Tooltip title="Link Mods">
                                                <Button 
                                                    size="small"
                                                    className="w-12"
                                                    color="info"
                                                    onClick={() => setModLinkerSaveId(id)}
                                                >
                                                    <span className="mr-1 text-blue-400">
                                                        <FontAwesomeIcon icon={faPlus}/>
                                                    </span>

                                                </Button>
                                            </Tooltip>

                                            <Tooltip title="Delete Save">
                                                <Button 
                                                    size="small"
                                                    className="w-12"
                                                    color="error"
                                                    onClick={() => deleteSave(id)}
                                                >
                                                    <span className="mr-1 text-red-500">
                                                        <FontAwesomeIcon icon={faTrash}/>
                                                    </span>

                                                </Button>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </div>
                            })}
                        </div>
                    </div>
                </>}
            </div>
        </div>
    </FullScreenLoadingOverlay>
}

export default LoadGamePage