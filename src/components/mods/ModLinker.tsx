import { 
	IconButton, 
	Tooltip, 
	Button,
	Divider,
	Skeleton,
	TextField,
	InputAdornment,
} from "@mui/material"
import {ReactNode, useRef, useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
	faArrowLeft, 
	faPlus, 
	faXmark, 
	faInfo,
	faFaceSadCry,
	faMagnifyingGlass
} from "@fortawesome/free-solid-svg-icons"
import {Link, useNavigate} from "react-router-dom"
import {useGlobalConfirm} from "../../hooks/globalConfirm"
import {useAppContext} from "../../routes/store"
import {useEffectAsync} from "../../hooks/effectAsync"
import type {ManifestIndex} from "../../lib/shabah/downloadClient"
import {MOD_CARGO_TAG} from "../../config"
import {useCloseOnEscape} from "../../hooks/closeOnEscape"
import {DESCENDING_ORDER, FilterOrder} from "../FilterChevron"
import {sleep} from "../../lib/util"
import {Paginator} from "../Paginator"
import {useDebounce} from "../../hooks/debounce"
import {SEARCH_PARAM_KEYS} from "../../lib/consts"

const {
	ADDONS_INFO_MODAL, 
	ADDONS_MODAL, 
	ADDONS_VIEWING_CARGO
} = SEARCH_PARAM_KEYS

type LinkableModProps = {
    mod: ManifestIndex
    actionIcon: ReactNode
}

const LinkableMod = ({mod, actionIcon}: LinkableModProps) => {
	return <div className="w-full">
		<div className="px-1 py-2 w-full flex items-center text-sm rounded text-neutral-200 hover:bg-neutral-900/50">
			<div className="w-9/12 sm:w-8/12 whitespace-nowrap text-ellipsis overflow-clip">
				{mod.name}
			</div>

			<div className="w-3/12 text-left flex justify-end items-center">
				<div>
					<Link
						to={`/add-ons?${ADDONS_VIEWING_CARGO}=${encodeURIComponent(mod.canonicalUrl)}&${ADDONS_MODAL}=${ADDONS_INFO_MODAL}`}
						target="_blank"
					>
						<Tooltip title="Info">
							<button className="text-blue-500 mr-6">
								<FontAwesomeIcon icon={faInfo}/>
							</button>
						</Tooltip>
					</Link>
				</div>

				<div>
					{actionIcon}
				</div>
			</div>
		</div>
	</div>
}

const PAGE_LIMIT = 25

type SortType = (
    "updated"
)

const unlinkedModsSkeleton = <div>
	<div>
		<Divider className="bg-neutral-600"/>
	</div>
	<div className="w-full flex flex-wrap">
		{new Array<number>(10).fill(1).map((_, index) => {
			return <div
				key={`unlinked-skeleton-${index}`}
				className="flex items-center justify-end w-full py-2"
			>
				<div className="w-3/4">
					<Skeleton 
						height={15}
						width={100}
						variant="rounded"  
						animation="wave"
					/>
				</div>

				<div className="w-1/4 px-2">
					<Skeleton 
						height={15}
						width={40}
						variant="rounded"  
						animation="wave"
					/>
				</div>
			</div>
		})}
	</div>
</div>

export type ModLinkerProps = {
    onClose: () => void
    linkedMods: ManifestIndex[]
    setLinkedMods: (newMods: ManifestIndex[]) => void
}

export const ModLinker = ({
	onClose,
	linkedMods,
	setLinkedMods
}: ModLinkerProps) => {
	const {database} = useAppContext()
	const confirm = useGlobalConfirm()
	const navigate = useNavigate()
	useCloseOnEscape(onClose)
	const textSearchDelay = useDebounce(300)

	const [sort, _setSort] = useState<SortType>("updated")
	const [offset, setOffset] = useState(0)
	const [_queryTime, setQueryTime] = useState(0)
	const [modCount, setModCount] = useState(0)
	const [searchText, setSearchText] = useState("")
	const [loading, setLoading] = useState(true)
	const [order, _setOrder] = useState<FilterOrder>(DESCENDING_ORDER)
	const [cacheBusterId, _setCacheBusterId] = useState(0)
	const [cargoQuery, setCargoQuery] = useState({
		results: [] as ManifestIndex[],
		sort: "",
		order: DESCENDING_ORDER as FilterOrder,
		offset: 0,
		searchText: "",
		more: false
	})

	const {current: linkedMap} = useRef(new Map(
		linkedMods.map((cargo) => [cargo.canonicalUrl, 1])
	))

	useEffectAsync(async () => {
		const [count] = await Promise.all([
			database.cargoIndexes.modCount()
		] as const)
		setModCount(count)
	}, [])

	useEffectAsync(async () => {
		if (modCount < 1) {
			return
		}

		if (searchText.length > 0) {
			setLoading(true)
			textSearchDelay(async () => {
				const start = Date.now()
				const query = await database.cargoIndexes.similaritySearchWithTag(
					MOD_CARGO_TAG,
					{
						text: searchText,
						sort,
						order,
						limit: PAGE_LIMIT
					}
				)
				setQueryTime(Date.now() - start)
				setCargoQuery({
					results: query,
					order,
					sort,
					offset: 0,
					more: false,
					searchText
				})
				setLoading(false)
			})
			return
		}

		setLoading(offset === 0)
		const minimumTime = sleep(400)
		const start = Date.now()
		const query = await database.cargoIndexes.getMods({
			sort,
			order,
			offset,
			limit: PAGE_LIMIT
		})
		setQueryTime(Date.now() - start)
		await minimumTime
		const filteredQuery = query.filter(
			(cargo) => !linkedMap.has(cargo.canonicalUrl)
		)
		const results = offset === 0
			? filteredQuery
			: [...cargoQuery.results, ...filteredQuery]
		setCargoQuery({
			results,
			order,
			sort,
			offset,
			searchText: "",
			more: results.length < modCount
		})
		setLoading(false)
	}, [searchText, sort, order, offset, modCount, cacheBusterId])

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
				<div className="text-green-500 text-sm mb-1">
					{"Linked"}
                    
					<span className="text-neutral-500 ml-1 text-xs">
						{`(${(linkedMods.length).toLocaleString("en-us")} mods)`}
					</span>
				</div>
				<div className="h-32 overflow-y-scroll">
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
														const copy = [...linkedMods]
														copy.splice(index, 1)
														setLinkedMods(copy)
														setCargoQuery((previous) => {
															return {
																...previous,
																results: [mod, ...previous.results]
															}
														})
														linkedMap.delete(mod.canonicalUrl)
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
				<div className="text-blue-500 text-sm mb-1">
					{"Unlinked"}
					<span className="text-neutral-500 ml-1 text-xs">
						{`(${(modCount - linkedMods.length).toLocaleString("en-us")} mods)`}
					</span>
				</div>
                
				<div className="mb-2">
					<TextField 
						id="unlinked-mod-search"
						name="unlinked-mod-search"
						placeholder={"Mod name..."}
						value={searchText}
						fullWidth
						size="small"
						onChange={(event) => setSearchText(event.target.value)}
						InputProps={{
							startAdornment: <InputAdornment position="start">
								<span className="text-neutral-300">
									<FontAwesomeIcon icon={faMagnifyingGlass}/>
								</span>
							</InputAdornment>
						}}
					/>
				</div>

				<div className="h-32 overflow-y-scroll">
					{loading ? <>{unlinkedModsSkeleton}</> : <>
						{cargoQuery.results.length < 1 ? <>
							<div className="w-full py-2 text-center text-sm text-neutral-400">
								<span className="mr-2 text-yellow-500">
									<FontAwesomeIcon icon={faMagnifyingGlass}/>
								</span>
								{"No mods found"}
							</div>

							{modCount < 1 ? <>
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
								{cargoQuery.results.map((mod, index) => {
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
														onClick={() => {
															linkedMap.set(mod.canonicalUrl, 1)
															setCargoQuery((previous) => {
																const {results} = previous
																const targetIndex = results.findIndex(
																	(cargo) => cargo.canonicalUrl === mod.canonicalUrl
																)
																const copy = {...previous}
																if (targetIndex < 0) {
																	return copy
																}
																results.splice(targetIndex, 1)
																return copy
															})
															setLinkedMods([...linkedMods, mod])
														}}
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

								{cargoQuery.more ? <Paginator
									id="unlinked-mod-paginator"
									threshold={[0, 0.5, 1.0]}
									onPaginate={() => {
										setOffset((previous) => previous + PAGE_LIMIT)
									}}
									className="flex items-center justify-end w-full py-2"
								>
									<div className="w-3/4">
										<Skeleton 
											height={15}
											width={100}
											variant="rounded"  
											animation="wave"
										/>
									</div>

									<div className="w-1/4 px-2">
										<Skeleton 
											height={15}
											width={40}
											variant="rounded"  
											animation="wave"
										/>
									</div>
                                    
								</Paginator> : <></>}
							</div>
						</>}
					</>}
				</div>
			</div>
		</div>
	</div>
}