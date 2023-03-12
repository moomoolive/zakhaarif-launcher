import {useEffect, useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faCreditCard, faHandPointDown} from "@fortawesome/free-solid-svg-icons"
import LoadingIcon from "../LoadingIcon"

const EXTENSION_LOADING_MESSAGES = [
	{
		icon: <div className="text-green-500">
			<FontAwesomeIcon icon={faHandPointDown}/>
		</div>,
		text: "Click the bottom right corner of screen to close at any time"
	},
	{
		icon: <div className="text-yellow-500">
			<FontAwesomeIcon icon={faCreditCard}/>
		</div>,
		text: "Never enter sensitive information into game or other extensions (credit cards, passwords, etc.)"
	},
] as const

export type ExtensionLoadingScreenProps = {
    onClose: () => Promise<void>
    isRetry: boolean
}

export const MESSAGES_LOAD_TIME = 3_500

export const ExtensionLoadingScreen = ({onClose, isRetry}: ExtensionLoadingScreenProps) => {
	const [messageIndex, setMessageIndex] = useState(0)

	useEffect(() => {
		const milliseconds = MESSAGES_LOAD_TIME
		let currentMessageIndex = messageIndex
		const timerId = window.setInterval(() => {
			if (currentMessageIndex + 1 < EXTENSION_LOADING_MESSAGES.length) {
				currentMessageIndex = currentMessageIndex + 1
			} else {
				currentMessageIndex = 0
			}
			currentMessageIndex = Math.max(0, currentMessageIndex)
			setMessageIndex(currentMessageIndex)
		}, milliseconds)
		return () => window.clearTimeout(timerId)
	}, [])

	return <div className="fixed z-20 w-screen h-screen top-0 left-0 flex items-center flex-col justify-center">
		<div className="w-full h-1/2 flex items-end justify-center">
			<div className="mb-5">
				<div className="text-6xl text-blue-500 animate-spin">
					<LoadingIcon/>
				</div>
			</div>
		</div>
        
		<div className="w-full h-1/2 flex items-start justify-center">
			<div>
				<div className="mb-2 text-center">
					{`${isRetry ? "Restarting" : "Starting"}...`}
				</div>
				<div className="w-3/5 max-w-xs mx-auto flex justify-center">
					<div className="mr-4 mt-1">
						{EXTENSION_LOADING_MESSAGES[messageIndex].icon}
					</div>
					<div className="text-xs text-neutral-400">
						{EXTENSION_LOADING_MESSAGES[messageIndex].text}
					</div>
				</div>
			</div>
		</div>

		<button 
			className="absolute animate-pulse bottom-0 right-0 rounded-full bg-green-500 w-8 h-8 mr-2 mb-2"
			onClick={onClose}    
		/>
	</div>
}
