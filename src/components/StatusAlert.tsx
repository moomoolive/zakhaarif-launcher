import {Alert} from "@mui/material"
import {CSSProperties, ReactNode, useEffect} from "react"

export type StatusAlertProps = {
    onClose: () => void
    autoClose?: number
    color: "info" | "error" | "warning" | "success"
    className?: string
    content: ReactNode
    style?: CSSProperties
}

export const StatusAlert = ({
	onClose,
	color,
	autoClose = 0,
	content,
	className,
	style
}: StatusAlertProps): JSX.Element => {
    
	useEffect(() => {
		if (autoClose < 1) {
			return
		}
		const timerId = window.setTimeout(onClose, autoClose)
		return () => window.clearTimeout(timerId) 
	}, [])

	return <Alert 
		severity={color}
		className={"animate-fade-in-left " + className}
		style={style}
	>
		{content}
	</Alert>
}