import type {Mime} from "../../lib/miniMime/index"
import {useState, useRef} from "react"
import {useEffectAsync} from "../../hooks/effectAsync"
import {io} from "../../lib/monads/result"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
	faCircleExclamation, 
	faArrowLeft,
	faHeading,
	faDownload,
	faXmark,
} from "@fortawesome/free-solid-svg-icons"
import {Tooltip, IconButton, Divider} from "@mui/material"
import {BYTES_PER_MB} from "../../lib/utils/consts/storage"
import {useCloseOnEscape} from "../../hooks/closeOnEscape"
import {MimeIcon} from "./MimeIcon"

export type FileOverlayProps = {
    name: string
    mime: Mime
    url: string
    fileResponse: Response,
    bytes: number
    onClose: () => void
}

export const FileOverlay = ({
	name, 
	mime, 
	fileResponse, 
	url, 
	onClose,
	bytes
}: FileOverlayProps) => {
	const [fileText, setFileText] = useState("")
	const [showHeaders, setShowHeaders] = useState(false)
	const consumedResponse = useRef(false)

	const contentType = showHeaders
		? "headers"
		: mime

	useEffectAsync(async () => {
		if (
			consumedResponse.current
            || mime.startsWith("image/")
            || mime.startsWith("video/")
		) {
			return
		}
		const textResponse = await io.wrap(fileResponse.text())
		consumedResponse.current = true
		if (!textResponse.ok) {
			return
		}
		setFileText(textResponse.data)
	}, [fileResponse])

	useCloseOnEscape(onClose)
    
	return <div 
		className="fixed bg-neutral-900/80 z-20 w-screen h-screen overflow-clip flex items-center justify-center"
	>
		<div className="absolute z-30 top-1 left-1 w-full flex">
			<div className="w-1/2 overflow-x-clip text-ellipsis whitespace-nowrap">
				<Tooltip title="Close">
					<IconButton
						onClick={onClose}
					>
						<span className="text-xl">
							<FontAwesomeIcon 
								icon={faArrowLeft}
							/>
						</span>
					</IconButton>
				</Tooltip>

				<Tooltip title={name}>
					<span className="ml-3">
						<MimeIcon
							filename={name}
							mime={mime} 
							className="mr-3"
						/>
						{name}
					</span>
				</Tooltip>
			</div>
			<div className="w-1/2 text-right text-sm">
				<span className="mr-3">
					<Tooltip title="Response Headers">
						<IconButton 
							size="small"
							className="hover:text-green-500"
							onClick={() => setShowHeaders(true)}
						>
							<FontAwesomeIcon 
								icon={faHeading}
							/>
						</IconButton>
					</Tooltip>
				</span>

				<span className="mr-3">
					<Tooltip title="Download">
						<a download={name} href={url}>
							<IconButton 
								size="small"
								className="hover:text-green-500"
							>
								<FontAwesomeIcon 
									icon={faDownload}
								/>
							</IconButton>
						</a>
					</Tooltip>
				</span>
			</div>
		</div>

		<div className="w-5/6 max-w-xl">
			{((content: typeof contentType) => {
				if (content === "headers") {
					return <div
						className="px-4 pb-4 pt-2 w-full bg-neutral-800 rounded"
					>
						<div className="text-right pb-2">
							<Tooltip title="Close">
								<IconButton 
									size="small"
									className="hover:text-red-500"
									onClick={() => setShowHeaders(false)}
								>
									<FontAwesomeIcon
										icon={faXmark}
									/>
								</IconButton>
							</Tooltip>
						</div>

						<div
							className="overflow-y-scroll overflow-x-clip break-words"
							style={{maxHeight: "230px"}}
						>
							<div className={`text-sm ${fileResponse.status > 399 ? "text-red-500" : "text-green-500"} mb-1`}>
								<span className="text-neutral-400">
									{"request url:"}
								</span>
                                
								<span className="ml-1">
									{url}
								</span>
							</div>
                            
							<div className={`text-sm ${fileResponse.status > 399 ? "text-red-500" : "text-green-500"} mb-1`}>
								<span className="text-neutral-400">
									{"status:"}
								</span>
                                
								<span className="ml-1">
									{fileResponse.status}
								</span>
								<span className="ml-1">
									{`(${fileResponse.statusText})`}
								</span>
							</div>

							<div className="my-2">
								<Divider/>
							</div>

							{((headers: Headers) => {
								const values = [] as {key: string, value: string}[]
								for (const [key, value] of headers.entries()) {
									values.push({key, value})
								}
								return values
							})(fileResponse.headers).map((header, index) => {
								const {key, value} = header
								return <div
									key={`file-header-${index}`}
									className="text-sm mb-1"
								>
									<span className="text-neutral-400">
										{`${key}: `}
									</span>
									<span className="text-neutral-100">
										{value}
									</span>
								</div>
							})}
						</div>
                        
					</div>
				} else if (content.startsWith("image/")) {
					return <img 
						src={url}
						className="w-full"
						crossOrigin=""
					/>
				} else if (content.startsWith("video/")) {
					return <video
						controls
						crossOrigin=""
						src={url}
						className="w-full"
					/>
				} else if (bytes < BYTES_PER_MB * 3) {
					return <div 
						className="p-4 bg-neutral-800 rounded whitespace-pre-wrap flex"
                        
					>
						<div 
							className="w-full overflow-y-scroll"
							style={{maxHeight: "300px"}}
						>
							{fileText}
						</div>
					</div>
				} else {
					return <div
						className="p-4 w-full text-center"
					>
						<span className="mr-2 text-yellow-500">
							<FontAwesomeIcon
								icon={faCircleExclamation}
							/>
						</span>
                        File is too large. Download to view.
					</div>
				}
			})(contentType)}
		</div>
	</div>
}