import type {ManifestIndex, ManifestState} from "../../lib/shabah/downloadClient"
import {readableByteCount} from "../../lib/util"
import {reactiveDate} from "../../lib/util"
import {isMod} from "../../lib/utils/cargos"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faExclamationTriangle, faFolder, faMagnifyingGlass, faRotate} from "@fortawesome/free-solid-svg-icons"
import {useRef} from "react"
import {ABORTED, FAILED, UPDATING} from "../../lib/shabah/backend"
import {Paginator} from "../Paginator"

type CargoSummaryProps = {
    onClick: () => void | Promise<void>
    icon: JSX.Element
    name: string
    type: string
    updatedAt: number
    byteCount: number
    status: JSX.Element
}

const CargoIndexSummary = ({
	onClick, 
	icon, 
	name,
	type,
	updatedAt,
	byteCount,
	status,
}: CargoSummaryProps) => {
	const friendlyBytes = readableByteCount(byteCount)

	return <button
		className="p-4 w-full text-left flex justify-center items-center hover:bg-neutral-900"
		onClick={onClick}
	>
        
		<div className={"relative z-0 w-1/2 lg:w-1/3 whitespace-nowrap text-ellipsis overflow-clip"}>
			{icon}
			{name}
		</div>
        
		<div className="hidden lg:block w-1/6 text-center text-xs text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
			{status}
		</div>

		<div className={"w-1/6 hidden md:block text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip"}>
			{type}
		</div>
        
		<div className={"w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip"}>
			{reactiveDate(new Date(updatedAt))}
		</div>
        
		<div className="w-1/4 md:w-1/6 text-xs text-center text-neutral-400 whitespace-nowrap text-ellipsis overflow-clip">
			{`${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`}
		</div>
	</button>
}

type CargoSummaryIconProps = {
    cargoState: ManifestState, 
    isAMod: boolean
}

const CargoSummaryIcon = ({cargoState, isAMod}: CargoSummaryIconProps): JSX.Element => {
	switch (cargoState) {
	case ABORTED:
	case FAILED:
		return <>
			<span className={"mr-3"}>
				<FontAwesomeIcon 
					icon={faFolder}
				/>
			</span>
			<div className="absolute z-10 bottom-0 left-0 text-red-500">
				<span style={{fontSize: "12px"}}>
					<FontAwesomeIcon icon={faExclamationTriangle}/>
				</span>
			</div>
		</>
	case UPDATING:
		return <>
			<span className={"mr-3 text-blue-500"}>
				<FontAwesomeIcon icon={faFolder}/>
			</span>
			<div className="absolute z-10 bottom-0 left-0 animate-spin">
				<span style={{fontSize: "12px"}}>
					<FontAwesomeIcon icon={faRotate}/>
				</span>
			</div>
		</>
	default:
		return <>
			<span className={"mr-3 " + (isAMod ? "text-indigo-500" : "text-green-500")}>
				<FontAwesomeIcon icon={faFolder}/>
			</span>
		</>
	}
}

export type CargoListProps = {
    onViewCargo: (url: string) => void
    cargosIndexes: ManifestIndex[]
    hasMore: boolean,
    onPaginate: () => void
}

export const CargoList = ({
	onViewCargo,
	cargosIndexes,
	hasMore,
	onPaginate
}: CargoListProps): JSX.Element => {

	const {current: cargoStatus} = useRef((cargoState: ManifestState) => {
		switch (cargoState) {
		case ABORTED:
		case FAILED:
			return <span className="text-red-500">
				{"Failed"}
			</span>
		case UPDATING:
			return <span className="text-blue-500">
				{"Updating"}
			</span>
		default:
			return <span>{"Saved"}</span>
		}
	})

	return <div 
		className="w-full h-5/6 overflow-y-scroll animate-fade-in-left"
	>
		{cargosIndexes.length < 1 ? <>
			<div className="mt-16 w-full text-center">
				<div className="text-yellow-500 text-4xl mb-4">
					<FontAwesomeIcon icon={faMagnifyingGlass}/>
				</div>
				<div className="text-neutral-400">
					{"No add-ons found"}
				</div>
			</div>
		</> : <>
			{cargosIndexes.map((cargo, index) => {
				const isAMod = isMod(cargo)
				return <CargoIndexSummary
					key={`cargo-summary-${index}`}
					onClick={() => onViewCargo(cargo.canonicalUrl)}
					icon={<CargoSummaryIcon 
						cargoState={cargo.state}
						isAMod={isAMod} 
					/>}
					name={cargo.name}
					status={cargoStatus(cargo.state)}
					type={isAMod ? "mod" : "extension"}
					updatedAt={cargo.updated}
					byteCount={cargo.bytes}
				/>
			})}
		</>}

		<div className={`w-4/5 mx-auto my-3 ${hasMore ? "" : "hidden"}`}>
			<div className="animate-pulse text-center text-neutral-400 text-sm">
				<Paginator
					id="cargo-list-paginator"
					onPaginate={onPaginate}
				>
					<span>
						{"Loading..."}
					</span>
				</Paginator>
			</div>
		</div>

		<div className={`sm:hidden h-8 ${hasMore ? "hidden" : ""}`}/>
	</div> 
}