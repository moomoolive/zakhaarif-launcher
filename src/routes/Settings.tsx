import {ReactNode, useEffect, useState, useRef, useMemo} from "react"
import {useNavigate, Link} from "react-router-dom"
import {useAppContext} from "./store"
import {useAsyncState} from "../hooks/promise"
import {STANDARD_CARGOS} from "../standardCargos"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
	faCodeBranch, 
	faArrowLeft, 
	faGear,
	faCodeCommit,
	faLink,
	faXmark,
	faFaceLaughSquint,
	faScrewdriver,
	faAngleRight,
	faUser,
	faHandshakeAngle,
	IconDefinition,
	faGamepad
} from "@fortawesome/free-solid-svg-icons"
import {Divider, IconButton, Tooltip} from "@mui/material"
import {useSearchParams} from "../hooks/searchParams"
import {SubPageList} from "./SettingsTabs/index"
import {SEARCH_PARAM_KEYS} from "../lib/consts"

type MiniRoutes = {
    readonly [key: string]: () => JSX.Element
}

const {SETTINGS_TAB} = SEARCH_PARAM_KEYS
const DO_NOT_DISPLAY_TAB = "none"

type SettingsTab = keyof typeof SubPageList | typeof DO_NOT_DISPLAY_TAB

const NO_CLIPBOARD_ACTION = "no-clipboard"

export default function SettingsPage(): JSX.Element {
	const navigate = useNavigate()
	const {downloadClient} = useAppContext()
	const [searchParams, setSearchParams] = useSearchParams()

	const {current: setSubpage} = useRef((key: SettingsTab) => {
		if (key === DO_NOT_DISPLAY_TAB) {
			searchParams.delete(SETTINGS_TAB)
		} else {
			searchParams.set(SETTINGS_TAB, key)
		}
		setSearchParams(new URLSearchParams(searchParams))
	})

	const [launcherMetadata] = useAsyncState(downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[0].canonicalUrl))
	const [gameMetadata] = useAsyncState(downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[1].canonicalUrl))
	const [clipboardActionId, setClipboardActionId] = useState(NO_CLIPBOARD_ACTION)

	const onClipboardAction = (actionId: string) => {
		setClipboardActionId(actionId)
		const milliseconds = 1_000
		window.setTimeout(() => setClipboardActionId(NO_CLIPBOARD_ACTION), milliseconds)
	}
    
	const versionText = launcherMetadata.loading
		? "loading..."
		: launcherMetadata.data?.version || "not installed"
	const gameVersionText = gameMetadata.loading
		? "loading..."
		:  gameMetadata.data?.version || "not installed"
    
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const {key} = event
			const lowerKey = key.toLowerCase()
			if (lowerKey === "escape") {
				navigate("/start")
			}
		}
		window.addEventListener("keyup", handler)
		return () => window.removeEventListener("keyup", handler)
	}, [])

	const displayLocation = useMemo(() => {
		if (!searchParams.has(SETTINGS_TAB)) {
			return DO_NOT_DISPLAY_TAB
		}
		const tab = searchParams.get(SETTINGS_TAB) || ""
		if (!(tab in SubPageList)) {
			return DO_NOT_DISPLAY_TAB
		}
		return tab as keyof typeof SubPageList     
	}, [searchParams])

	return <div className="w-screen h-screen flex items-center justify-center">
		<div className="relative z-0 w-full md:w-1/3 h-full flex items-center justify-end">
			<div className="w-full h-full md:max-w-sm md:px-2">
				<div className="w-full h-1/12 flex items-center justify-center">
					<div className="w-1/2 pl-4">
						<Tooltip title="Back" placement="right">
							<Link to="/start">
								<IconButton>
									<FontAwesomeIcon 
										icon={faArrowLeft}
									/>
								</IconButton>
							</Link>
						</Tooltip>
					</div>
					<div className="w-1/2 pr-4 text-right">
						<Tooltip title="Settings" placement="left">
							<span className="text-blue-500 text-xl">
								<FontAwesomeIcon icon={faGear} />
							</span>
						</Tooltip>
					</div>
				</div>

				<div className="w-full">
					{([
						{
							header: "User",
							subsections: [
								{
									id: "profile-options",
									icon: faUser,
									name: "Profile",
									contents: OPEN_PAGE_ICON,
									onClick: () => setSubpage("userProfile")
								},
							]
						},
						{
							header: "info",
							subsections: [
								{
									id: "new-content",
									icon: faCodeBranch, 
									name: "What's new",
									nameStyles: {width: "60%"},
									contentStyles: {width: "40%"},
									contents: <FontAwesomeIcon icon={faLink}/>,
									onClick: () => {
										window.open(
											import.meta.env.VITE_APP_RELEASE_NOTES_URL,
											"_blank",
											"noopener"
										)
									}
								},
								{
									id: "acknowledgements",
									icon: faHandshakeAngle, 
									name: "OSS",
									tooltip: "Open Source Libraries Used",
									nameStyles: {width: "80%"},
									contentStyles: {width: "20%"},
									contents: OPEN_PAGE_ICON,
									onClick: () => setSubpage("acknowledgments")
								},
							]
						},
						{
							header: "developers",
							subsections: [
								{
									id: "developer-options",
									icon: faScrewdriver,
									name: "Options",
									contents: OPEN_PAGE_ICON,
									onClick: () => setSubpage("developerOptions")
								},
								{
									id: "version",
									icon: faCodeBranch, 
									name: "Launcher Version", 
									contents: <>{
										clipboardActionId === "version" 
											? "Copied!" 
											: versionText
									}</>,
									onClick: () => {
										navigator.clipboard.writeText(versionText)
										onClipboardAction("version")
									}
								},
								{
									id: "game-version",
									icon: faGamepad, 
									name: "Game Version", 
									contents: <>{
										clipboardActionId === "game-version" 
											? "Copied!" 
											: gameVersionText
									}</>,
									onClick: () => {
										navigator.clipboard.writeText(gameVersionText)
										onClipboardAction("game-version")
									}
								},
								{
									id: "repo-link",
									icon: faCodeCommit, 
									name: "Repo", 
									contents: <FontAwesomeIcon icon={faLink}/>,
									onClick: () => {
										window.open(
											import.meta.env.VITE_APP_CODE_REPO_URL,
											"_blank",
											"noopener"
										)
									}
								},
							]
						},
					] as const).map((section, index) => {
						const {header, subsections} = section
						return <div
							key={`setting-section-${index}`}
							className="mb-3"
						>
							<div className="mb-3 bg-neutral-700">
								<Divider/>
							</div>
							<div className="pb-2 text-neutral-400 text-xs px-4 uppercase">
								{header}
							</div>
							{subsections.map((subsection, subIndex) => {
								const {
									icon, name, 
									contents, onClick,
									contentStyles = {},
									nameStyles = {},
									tooltip = ""
								} = subsection as SettingSubsection
								return <Tooltip
									key={`section-${index}-sub-${subIndex}`}
									title={tooltip || name}
								>
									<button
										className="w-full px-4 py-3 flex hover:bg-neutral-700"
										onClick={onClick}
									>
										<div 
											className="w-1/2 text-left overflow-clip text-ellipsis whitespace-nowrap"
											style={nameStyles}
										>
											<span className="mr-3 text-neutral-400">
												<FontAwesomeIcon icon={icon}/>
											</span>
											{name}
										</div>
										<div 
											className="w-1/2 text-right text-neutral-400 overflow-x-clip text-ellipsis whitespace-nowrap"
											style={contentStyles}
										>
											{contents}
										</div>
									</button>
								</Tooltip>
							})}
						</div>
					})}
				</div>
			</div>
		</div>


		<MiniRouter 
			FallbackRoute={({className, onAnimationEnd}) => <div 
				className={"hidden md:block w-2/3 border-l-2 border-solid border-neutral-600 py-5 h-full bg-neutral-800 " + className}
				onAnimationEnd={onAnimationEnd}
			>
				<div className="w-full px-2 flex max-w-3xl items-center justify-start">
					<CoolEscapeButton className="w-full"/>
				</div>
				<div className="w-full h-4/5 flex items-center justify-center">
					<div className="w-full text-center">
						<div className="text-4xl mb-2 text-yellow-500">
							<FontAwesomeIcon icon={faFaceLaughSquint} />
						</div>
						<div>
							{"Welcome to Settings!"}
						</div>
					</div>
				</div>
			</div>}
			displayLocation={displayLocation}
			routes={SubPageList}
			returnToHome={() => setSubpage(DO_NOT_DISPLAY_TAB)}
		/>
	</div>
}

type SettingRouteProps = {
    children: ReactNode
    returnToHome: () => void
    className: string
    onAnimationEnd: () => void
}

function SettingRoute ({
	children, 
	returnToHome,
	className,
	onAnimationEnd
}: SettingRouteProps): JSX.Element {
	return <div
		className={"fixed z-10 top-0 left-0 md:relative w-screen md:w-2/3 md:py-5 h-screen md:border-l-2 border-solid border-neutral-600 md:h-full bg-neutral-800 "}
	>
		<div className="px-2 h-1/12 w-full flex max-w-3xl items-center justify-start">
			<div className="ml-2 h-full mt-3 md:hidden">
				<Tooltip title="Back" placement="right">
					<IconButton onClick={returnToHome}>
						<FontAwesomeIcon icon={faArrowLeft}/>
					</IconButton>
				</Tooltip>
			</div>
			<CoolEscapeButton className="w-full h-full hidden md:block"/>
		</div>
		<div 
			className={"p-6 h-11/12 " + className}
			onAnimationEnd={onAnimationEnd}
		>
			{children}
		</div>
	</div>
}

type MiniRouterProps<Routes extends MiniRoutes> = {
    displayLocation: keyof Routes | typeof DO_NOT_DISPLAY_TAB
    routes: Routes
    FallbackRoute: (props: {className: string, onAnimationEnd: () => void}) => JSX.Element
    returnToHome: () => void
}

const fadeIn = 1
const fadeOut = 2

function MiniRouter<Routes extends MiniRoutes>({
	displayLocation, 
	routes, 
	FallbackRoute, 
	returnToHome
}: MiniRouterProps<Routes>) {
	const [transition, setTransition] = useState(fadeIn)
	const [renderedLocation, setRenderedLocation] = useState(displayLocation)

	useEffect(() => {
		if (displayLocation !== renderedLocation) {
			setTransition(fadeOut)
		}
	}, [displayLocation, renderedLocation])

	if (renderedLocation === DO_NOT_DISPLAY_TAB) {
		if (transition === fadeOut) {
			setTransition(fadeIn)
			setRenderedLocation(displayLocation)
		}
		return <FallbackRoute
			className={`${transition === fadeIn ? "animate-fade-in-left" : "animate-fade-out-left"}`}
			onAnimationEnd={() => {
				if (transition === fadeOut) {
					setTransition(fadeIn)
					setRenderedLocation(displayLocation)
				}
			}}
		/>
	}


	const Component = routes[renderedLocation] as () => JSX.Element

	return <SettingRoute 
		returnToHome={returnToHome}
		className={`${transition === fadeIn ? "animate-fade-in-left" : "animate-fade-out-left"}`}
		onAnimationEnd={() => {
			if (transition === fadeOut) {
				setTransition(fadeIn)
				setRenderedLocation(displayLocation)
			}
		}}
	>
		<Component/>
	</SettingRoute>
    
}

const OPEN_PAGE_ICON = <FontAwesomeIcon icon={faAngleRight}/>

type SettingSubsection = {
    id: string
    icon: IconDefinition
    name: string
    contents: ReactNode,
	tooltip?: string
    onClick: () => unknown
    nameStyles?: Partial<{width: string}>
    contentStyles?: Partial<{width: string}>
}

function CoolEscapeButton({className = ""} = {}): JSX.Element {
	return <div className={"text-right " + className}>
		<Link to="/start">
			<div className="w-full mb-1">
				<button className="border-neutral-300 border-solid border text-lg rounded-full px-2.5 py-0.5 hover:bg-neutral-200/10">
					<FontAwesomeIcon icon={faXmark}/>
				</button>
			</div>
			<div className="w-full uppercase text-xs">
				<span className="mr-1">
                    esc
				</span>
			</div>
		</Link>
	</div>
}