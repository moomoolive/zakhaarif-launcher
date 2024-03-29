import {useEffectAsync} from "../hooks/effectAsync"
import {useMemo, useState} from "react"
import {
	MANUAL_SAVE,
	QUICK_SAVE,
	AUTO_SAVE,
	GameSave
} from "../lib/database/GameSaves"
import {BackNavigationButton} from "../components/navigation/BackNavigationButton"
import {faFloppyDisk, faRobot, faBolt, faPlus, faTrash} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {Button, Skeleton, Tooltip} from "@mui/material"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {ModLinker} from "../components/mods/ModLinker"
import {useAppContext} from "./store"
import {ASCENDING_ORDER, DESCENDING_ORDER, FilterChevron, FilterOrder} from "../components/FilterChevron"
import {useNavigate} from "react-router-dom"
import {ManifestIndex} from "../lib/shabah/downloadClient"
import {sleep} from "../lib/util"
import {GAME_EXTENSION_CARGO} from "../standardCargos"
import {LOCAL_STORAGE_KEYS, SEARCH_PARAM_KEYS} from "../lib/consts"

const {EXTENSION_SHELL_TARGET} = SEARCH_PARAM_KEYS
const {SAVE_EXISTS} = LOCAL_STORAGE_KEYS
const FILTERS = [
	{text: "Modified", key: "updatedAt"},
	{text: "Name", key: "name"},
	{text: "Type", key: "type"},
] as const
const DO_NOT_SHOW_LINKER = -1

type FilterType = typeof FILTERS[number]["key"]

export default function LoadGamePage(): JSX.Element {
	const {database} = useAppContext()
	const confirm = useGlobalConfirm()
	const navigate = useNavigate()

	const [loading, setLoading] = useState(true)
	const [saves, setSaves] = useState([] as GameSave[])
	const [modLinkerSaveId, setModLinkerSaveId] = useState(DO_NOT_SHOW_LINKER)
	const [currentFilter, setCurrentFilter] = useState<FilterType>("updatedAt")
	const [order, setOrder] = useState<FilterOrder>(DESCENDING_ORDER)
	const [linkedMods, setLinkedMods] = useState<ManifestIndex[]>([])

	const filteredSaves = useMemo(() => {
		const savesList = [...saves]
		const orderFactor = order
		switch (currentFilter) {
		case "type":
			return savesList.sort((a, b) => {
				const factor = a.type > b.type ? 1 : -1
				return factor * orderFactor
			})
		case "name":
			return savesList.sort((a, b) => {
				return a.name.localeCompare(b.name) * orderFactor
			})
		case "updatedAt":
		default:
			return savesList.sort((a, b) => {
				const factor = a.updated > b.updated ? 1 : -1
				return factor * orderFactor
			})
		}
	}, [saves, currentFilter, order])

	useEffectAsync(async () => {
		if (modLinkerSaveId === DO_NOT_SHOW_LINKER) {
			return
		}
        
		const saveIndex = saves.findIndex((save) => save.id === modLinkerSaveId)
		if (saveIndex < 0) {
			return
		}
		const linked: ManifestIndex[] = []
		const targetSave = saves[saveIndex]
		const modIndexes = await database.cargoIndexes.getManyIndexes(
			targetSave.mods.canonicalUrls
		)
		for (let i = 0; i < modIndexes.length; i++) {
			const index = modIndexes[i]
			if (!index) {
				continue
			}
			linked.push(index)
		}
		setLinkedMods(linked)
	}, [modLinkerSaveId, saves])

	const deleteSave = async (id: number) => {
		if (!await confirm({title: "Are you sure you want to delete this save?", confirmButtonColor: "warning"})) {
			return
		}
		const index = saves.findIndex((save) => save.id === id)
		if (index < 0) {
			return
		}
		database.gameSaves.deleteById(id)
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
			setOrder(DESCENDING_ORDER)
		} else if (order === DESCENDING_ORDER) {
			setOrder(ASCENDING_ORDER)
		} else {
			setOrder(DESCENDING_ORDER)
		}
	}

	useEffectAsync(async () => {
		const [allSaves] = await Promise.all([
			database.gameSaves.getAll(),
			sleep(500)
		] as const)
		setSaves(allSaves)
		setLoading(false)
	}, [])

	if (loading) {
		return <div 
			className="w-screen h-screen fixed z-0 flex items-center justify-center"
		>
			<BackNavigationButton/>
			<GameSavesSkeleton/>
		</div>
	}

	return <div 
		className="w-screen h-screen fixed z-0 flex items-center justify-center"
	>
		<BackNavigationButton/>

		{modLinkerSaveId !== DO_NOT_SHOW_LINKER ? <>
			<ModLinker
				linkedMods={linkedMods}
				setLinkedMods={async (linked) => {
					const saveIndex = saves.findIndex((save) => save.id === modLinkerSaveId)
					const copy = [...saves]
					const newSave = {
						...saves[saveIndex],
						mods: linked.reduce((total, next) => {
							total.canonicalUrls.push(next.canonicalUrl)
							total.resolvedUrls.push(next.resolvedUrl)
							total.entryUrls.push(next.entry)
							total.semvers.push(next.version)
							return total
						}, {
							canonicalUrls: [] as string[],
							resolvedUrls: [] as string[],
							entryUrls: [] as string[],
							semvers: [] as string[]
						}),
					} as const
					database.gameSaves.updateOne(
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
				className="w-full h-full flex items-center justify-center animate-fade-in-left"
			>
				<div className="text-center text-xl">
					<div className="mb-3 text-yellow-500 text-4xl">
						<FontAwesomeIcon icon={faFloppyDisk}/>
					</div>
					{"No Saves Found..."}
				</div>
			</div> : <div className="animate-fade-in-left">
				<div className="w-full h-full max-w-4xl mx-auto">
					<div className="w-full mt-14 mb-3 px-2">
						{FILTERS.map((data, index) => {
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
							const {name, type, updated, id} = save
							const openGame = () => navigate(`/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(GAME_EXTENSION_CARGO.canonicalUrl)}&state=${id.toString()}`)
							return <div
								key={`save-${index}`}
								className="w-full text-left bg-neutral-900 cursor-pointer hover:bg-neutral-900/60 mb-2 rounded shadow-2xl border-l-4 border-solid border-blue-500"
							>
								<div 
									className="w-full flex items-center pt-2 px-2"
									onClick={openGame}
								>
									<div className="w-3/4 overflow-x-clip break-words">
										{name}
									</div>
									<div className="w-1/4 text-right">
										<div className="text-xs text-neutral-400">
											{((saveType: typeof type) => {
												switch (saveType) {
												case QUICK_SAVE:
													return <span>
														{"quick"}
														<span className="text-yellow-500 ml-1.5">
															<FontAwesomeIcon icon={faBolt}/>
														</span>
													</span>
												case AUTO_SAVE:
													return <span>
														{"auto"}
														<span className="text-indigo-500 ml-1.5">
															<FontAwesomeIcon icon={faRobot}/>
														</span>
													</span>
												case MANUAL_SAVE:
													return <span>
														{"manual"}
														<span className="text-blue-500 ml-2">
															<FontAwesomeIcon icon={faFloppyDisk}/>
														</span>
													</span>
												default:
													return <></>
                                                        
												}
											})(type)}
										</div>
									</div>
								</div>

								<div className="w-full py-2 px-2 text-xs text-neutral-500 flex items-center">
									<div className="w-1/2" onClick={openGame}>
										{new Date(updated).toLocaleString("en-us", {
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
			</div>}
		</div>
	</div>
}

function GameSavesSkeleton(): JSX.Element {
	return <div 
		className="w-full h-full max-w-4xl mx-auto"
	>
		<div 
			className="w-full h-5/6 mt-14 overflow-y-scroll overflow-x-clip px-2"
		>
			<div className="px-2 flex flex-wrap">
				{new Array<number>(FILTERS.length).fill(1).map((_, index) => {
					return <div 
						className="mr-3"
						key={`filter-skeleton-${index}`}
					>
						<Skeleton 
							animation="wave"
							height={30}
							width={50}
							className="inline-block"
						/>
					</div>
				})}
			</div>

			{new Array<number>(5).fill(1).map((_, index) => {
				return <div
					key={`game-save-skeleton-${index}`}
					className="w-full"
				>
					<Skeleton 
						animation="wave" 
						height={80}    
					/>
				</div>
			})}
		</div>
	</div>
} 