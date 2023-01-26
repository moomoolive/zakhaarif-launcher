import { DetailedHTMLProps, ReactNode, useEffect, useMemo, useRef, useState } from "react"
import {useNavigate, Link} from "react-router-dom"
import {useAppShellContext} from "./store"
import {usePromise} from "@/hooks/promise"
import {APP_CARGO_ID} from "@/config"
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
    faCheck,
    faUser,
    faHandshakeAngle,
    IconDefinition,
    faHeartBroken
} from "@fortawesome/free-solid-svg-icons"
import {Divider, IconButton, Tooltip, TextField, Switch} from "@mui/material"
import {PROFILE_NAME, UNSAFE_PACKAGE_PERMISSIONS} from "../lib/utils/localStorageKeys"
import { useDebounce } from "@/hooks/debounce"
import { useGlobalConfirm } from "@/hooks/globalConfirm"
import LoadingIcon from "@/components/LoadingIcon"
import { useEffectAsync } from "@/hooks/effectAsync"
import { io } from "@/lib/monads/result"
import { faNpm } from "@fortawesome/free-brands-svg-icons"

type SettingRouteProps = {
    children: ReactNode
    returnToHome: () => void
    className: string
    onAnimationEnd: () => void
}

const SettingRoute = ({
    children, 
    returnToHome,
    className,
    onAnimationEnd
}: SettingRouteProps) => {
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

type MiniRoutes = {
    readonly [key: string]: () => JSX.Element
}

type MiniRouterProps<Routes extends MiniRoutes> = {
    displayLocation: keyof Routes | "none"
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

    if (renderedLocation === "none") {
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
    onClick: () => unknown
    nameStyles?: Partial<{width: string}>
    contentStyles?: Partial<{width: string}>
}

type CreditElement = {
    name: string
    type: "npm"
    url: string
}

const SubPageList = {
    userProfile: () => {
        const optionsDebounce = useDebounce(500)

        const [profileName, setProfileName] = useState((() => {
            const previous = localStorage.getItem(PROFILE_NAME) || ""
            if (previous.length > 0) {
                return previous
            }
            return "default"
        })())
        const [peristenceLoading, setPersistenceLoading] = useState(false)

        return <div>
            <div>
                <TextField
                    id="profile-name-input"
                    name="profile-name"
                    label="Profile Name"
                    value={profileName}
                    onChange={(event) => {
                        setProfileName(event.target.value)
                        setPersistenceLoading(true)
                        optionsDebounce(() => {
                            localStorage.setItem(PROFILE_NAME, event.target.value)
                            setPersistenceLoading(false)
                        })
                    }}
                    helperText={
                        peristenceLoading 
                            ? <span className="animate-pulse">{"Loading..."}</span>
                            : <span className="text-green-500">
                                <span className="mr-2">
                                    <FontAwesomeIcon icon={faCheck}/> 
                                </span>
                                Saved
                            </span>
                    }
                />
            </div>
        </div>
    },
    acknowledgments: () => {
        const [credits, setCredits] = useState<CreditElement[]>([])
        const [loading, setLoading] = useState(true)
        const [error, setError] = useState(false)

        useEffectAsync(async () => {
            const creditsResponse = await io.wrap(fetch("/credits.json"))
            if (!creditsResponse.ok) {
                setError(true)
                return
            }
            const credits = await io.wrap(creditsResponse.data.json())
            if (!credits.ok) {
                setError(true)
                return
            }
            setError(false)
            setCredits(credits.data)
            setLoading(false)
        }, [])

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
                        {"This project wouldn't be possible without the help of the generous maintainers and contributors of these open-source packages (and their dependencies)."}
                    </div>
                    <div 
                        id="credits-compiled"
                        className="w-full h-10/12 px-2 py-3 overflow-x-clip overflow-y-scroll"
                    >
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
                    </div>
                </>}
            </>}
        </div>
    },
    developerOptions: () => {
        const confirm = useGlobalConfirm()
        
        const [unsafePermissions, setUnsafePermissions] = useState(
            !!localStorage.getItem(UNSAFE_PACKAGE_PERMISSIONS)
        )

        return <div>
            <div>
                <Switch 
                    id="unsafe-permissions-switch"
                    name="unsafe-permissions"
                    color="error"
                    checked={unsafePermissions}
                    onChange={async (event) => {
                        if (
                            event.target.checked 
                            && (await confirm({title: "Are you sure you want to allow unsafe packages?", description: "This should only be used for development purposes. Use this option at your own risk!", confirmButtonColor: "error"}))
                        ) {
                            setUnsafePermissions(event.target.checked)
                            localStorage.setItem(UNSAFE_PACKAGE_PERMISSIONS, "allow")
                        } else {
                            setUnsafePermissions(event.target.checked)
                            localStorage.removeItem(UNSAFE_PACKAGE_PERMISSIONS)
                        } 
                    }}
                    inputProps={{'aria-label': 'controlled'}}
                />
                <span>
                    {"Allow Unsafe Packages"}
                </span>
            </div>
        </div>
    }
}

const CoolEscapeButton = ({className = ""}= {}) => {
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

const SettingsPage = () => {
    const navigate = useNavigate()
    const {downloadClient} = useAppShellContext()

    const appVersion = usePromise(downloadClient.getCargoMeta(APP_CARGO_ID))

    const [clipboardActionId, setClipboardActionId] = useState("none")
    const [subpage, setSubpage] = useState<
        keyof typeof SubPageList | "none"
    >("none")

    const onClipboardAction = (actionId: string) => {
        setClipboardActionId(actionId)
        const milliseconds = 1_000
        window.setTimeout(() => setClipboardActionId("none"), milliseconds)
    }

    const SubpageComponent = useMemo(() => {
        if (subpage === "none") {
            return () => <></>
        }
        const component = SubPageList[subpage]
        return component
    }, [subpage])

    const versionText = appVersion.loading || !appVersion.data.ok
        ? "unknown"
        : appVersion.data.data?.version || "not installed"

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
                            <span className="text-green-500 text-xl">
                                <FontAwesomeIcon
                                    icon={faGear}
                                />
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
                                    name: "Acknowledgments",
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
                                    name: "Version", 
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
                                    nameStyles = {}
                                } = subsection as SettingSubsection
                                return <button
                                    key={`section-${index}-sub-${subIndex}`}
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
                            {"Welcome!"}
                        </div>
                    </div>
                </div>
            </div>}
            displayLocation={subpage}
            routes={SubPageList}
            returnToHome={() => setSubpage("none")}
        />
    </div>
}

export default SettingsPage