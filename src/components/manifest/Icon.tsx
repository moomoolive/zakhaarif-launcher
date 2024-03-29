import {NULL_FIELD as CARGO_NULL_FIELD} from "huzma"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faBoxOpen} from "@fortawesome/free-solid-svg-icons"
import {ReactNode} from "react"

export type CargoIconProps = {
    importUrl: string
    pixels: number
    logoUrl: string
    className?: string
    customIcon?: ReactNode
}

export const CargoIcon = ({
	logoUrl, 
	importUrl, 
	pixels, 
	className = "",
	customIcon = null
}: CargoIconProps) => {
	const cssPixels = `${pixels}px`
	return logoUrl === "" || logoUrl === CARGO_NULL_FIELD
		?   <div 
			className={"flex items-center justify-center rounded-2xl bg-neutral-900 shadow-lg " + className}
			style={{minWidth: cssPixels, height: cssPixels}}
		>
			<div style={{fontSize: `${Math.trunc(pixels / 2)}px`}}>
				{customIcon ? customIcon : <span
					className="text-blue-500" 
				> 
					<FontAwesomeIcon icon={faBoxOpen}/>
				</span>}
			</div>
		</div>
		:   <div className={className}>
			<img 
				src={`${importUrl}${logoUrl}`}
				crossOrigin=""
				className="rounded-2xl bg-neutral-900 shadow-lg"
				style={{minWidth: cssPixels, height: cssPixels}}
			/>
		</div>
}