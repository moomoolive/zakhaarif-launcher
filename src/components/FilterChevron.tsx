import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faChevronUp, faChevronDown} from "@fortawesome/free-solid-svg-icons"

export const ASCENDING_ORDER = 1
export type AscendingOrder = typeof ASCENDING_ORDER
export const DESCENDING_ORDER = -1
export type DescendingOrder = typeof DESCENDING_ORDER

export type FilterOrder = AscendingOrder | DescendingOrder

export type FilterChevronProps = {
    currentFilter: string, 
    targetFilter: string,
    order: FilterOrder
    className?: string
}

export const FilterChevron = ({
	currentFilter, 
	targetFilter,
	order,
	className = ""
}: FilterChevronProps) => {
	if (currentFilter !== targetFilter) {
		return <></>
	} else if (order === DESCENDING_ORDER) {
		return <span className={className}>
			<FontAwesomeIcon 
				icon={faChevronUp}
			/>
		</span>
	} else {
		return <span className={className}>
			<FontAwesomeIcon 
				icon={faChevronDown}
			/>
		</span>
	}
}