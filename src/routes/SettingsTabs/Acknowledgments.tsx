import {useEffect, useState, useRef} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faCubes, faHeartBroken} from "@fortawesome/free-solid-svg-icons"
import LoadingIcon from "../../components/LoadingIcon"
import {useEffectAsync} from "../../hooks/effectAsync"
import {io} from "../../lib/monads/result"
import {
	faNodeJs, 
	faNpm, 
	faFirefoxBrowser, 
	faRust,
	faGithub,
	faGolang
} from "@fortawesome/free-brands-svg-icons"
import {bismillah} from "../../lib/consts"
import type {Acknowledgment} from "../../lib/types/app"

type CreditElement = Acknowledgment

const CREDITS_DIV_ID = "credits-compiled"

export function Acknowledgments(): JSX.Element {
	const [credits, setCredits] = useState<CreditElement[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const creditScrollerIntervalRef = useRef(-1)

	useEffectAsync(async () => {
		const creditsResponse = await io.wrap(fetch("/credits.compiled.json"))
		if (!creditsResponse.ok) {
			setError(true)
			return
		}
		const creditsJson = await io.wrap(creditsResponse.data.json())
		if (!creditsJson.ok) {
			setError(true)
			return
		}
		setError(false)
		setCredits(creditsJson.data)
		setLoading(false)
	}, [])

	useEffect(() => {
		if (credits.length < 1) {
			return
		}
		const creditsDiv = document.getElementById(CREDITS_DIV_ID)
		if (!creditsDiv) {
			return
		}
		const milliseconds = 16
		const scrollerState = {
			previousScroll: -1
		}
		creditScrollerIntervalRef.current = window.setInterval(() => {
			if (scrollerState.previousScroll === creditsDiv.scrollTop) {
				window.clearInterval(creditScrollerIntervalRef.current)
				return
			}
			scrollerState.previousScroll = creditsDiv.scrollTop
			creditsDiv.scrollTop += 1
		}, milliseconds)
		return () => window.clearInterval(creditScrollerIntervalRef.current)
	}, [credits])

	return <div className="w-full h-full">
		{!error && loading ? <>
			<div className="w-full flex items-center justify-center">
				<div>
					<div className="animate-spin text-4xl text-blue-500">
						<LoadingIcon/>
					</div>
				</div>
			</div>
		</> : <>
			{error ? <>
				<div className="w-full text-center flex items-center justify-center">
					<div className="w-full">
						<div className="text-4xl mb-2 text-red-500">
							<FontAwesomeIcon icon={faHeartBroken}/>
						</div>
						<div className="w-4/5 mx-auto max-w-md">
							{"Error occurred!"}
							<div className="text-neutral-400 text-xs mt-1">
								{"Never wanted to give credits to others anyways..."}
							</div>
						</div>
					</div>
				</div>
			</> : <>
				<div className="w-11/12 border-b-2 border-solid border-neutral-600 pb-2 text-xs md:text-sm text-neutral-400">
					<div className="mb-2">
						{"This project wouldn't be possible without the help of the generous maintainers and contributors of these open-source projects and their dependencies."}
					</div>
					<div>
						{"** Projects are not affliated with Zakhaarif."}
					</div>
				</div>
				<div 
					id={CREDITS_DIV_ID}
					className="w-full h-10/12 px-2 py-3 overflow-x-clip overflow-y-scroll"
				>
					<div className="mb-5 text-center text-lg text-neutral-400">
						{bismillah}
					</div>
					{credits.map((credit, index) => {
						const {name, url, type} = credit
						return <a
							href={url}
							rel="noopener"
							target="_blank"
							key={`credit-${index}`}
							id={`credit-link-${index}`}
						>
							<button className="w-full flex mb-3 hover:text-green-500">
								<div className="mr-2">
									{((source: typeof type) => {
										switch (source) {
										case "node":
											return <span className="text-green-600 mx-0.5">
												<FontAwesomeIcon icon={faNodeJs}/>
											</span>
										case "mdn":
											return <span className="text-orange-500">
												<FontAwesomeIcon icon={faFirefoxBrowser}/>
											</span>
										case "rust":
											return <span className="text-red-400">
												<FontAwesomeIcon icon={faRust}/>
											</span>
										case "crates.io":
											return <span className="text-amber-300">
												<FontAwesomeIcon icon={faCubes}/>
											</span>
										case "github":
											return <span>
												<FontAwesomeIcon icon={faGithub}/>
											</span>
										case "go":
											return <span className="text-blue-400">
												<FontAwesomeIcon icon={faGolang}/>
											</span>
										case "npm":
										default:
											return <span className="text-red-500">
												<FontAwesomeIcon icon={faNpm}/>
											</span>
										}
									})(type)}
								</div>
								<div>
									{name}
								</div>
							</button>
						</a>
					})}
					<div className="mb-3 text-neutral-200">
						{"All the folks who maintain the web standards and browsers"}
					</div>
					<div className="mb-3 text-neutral-400">
						{"And probably many, many more..."}
					</div>
				</div>
			</>}
		</>}
	</div>
}