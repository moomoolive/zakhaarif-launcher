import {ReactNode, useEffect, useState} from "react"

export type ScreenSizeProps = {
    minWidth?: number
    maxWidth?: number
    children: ReactNode
}

export const ScreenSize = ({
	minWidth = 0,
	maxWidth = 1_000_000,
	children
}: ScreenSizeProps): JSX.Element => {
	const [screenDimensions, setScreenDimensions] = useState({x: window.innerWidth, y: window.innerHeight})
    
	useEffect(() => {
		const handler = () => setScreenDimensions({x: window.innerWidth, y: window.innerHeight})
		window.addEventListener("resize", handler)
		return () => window.removeEventListener("resize", handler)
	}, [])

	if (screenDimensions.x < minWidth || screenDimensions.x > maxWidth) {
		return <></>
	}

	return <>{children}</>
}