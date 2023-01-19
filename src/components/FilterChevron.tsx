import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faChevronUp, faChevronDown} from "@fortawesome/free-solid-svg-icons"

export type FilterOrder = "ascending" | "descending"

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
    } else if (order === "descending") {
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