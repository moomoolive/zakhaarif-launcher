import { useEffect, useState } from "react"
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
    faFaceLaughSquint
} from "@fortawesome/free-solid-svg-icons"
import {Divider, IconButton, Tooltip} from "@mui/material"

const SettingsPage = () => {
    const navigate = useNavigate()
    const {downloadClient} = useAppShellContext()

    const appVersion = usePromise(downloadClient.getCargoMeta(APP_CARGO_ID))

    const [clipboardActionId, setClipboardActionId] = useState("none")

    const onClipboardAction = (actionId: string) => {
        setClipboardActionId(actionId)
        const milliseconds = 1_000
        window.setTimeout(() => setClipboardActionId("none"), milliseconds)
    }

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
        <div className="w-full md:w-1/3 h-full flex items-center justify-end">
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
                            header: "info",
                            subsections: [
                                {
                                    id: "new-content",
                                    icon: faCodeBranch, 
                                    name: "What's new", 
                                    contents: <FontAwesomeIcon icon={faLink}/>,
                                    onClick: () => {
                                        window.open(
                                            import.meta.env.VITE_APP_RELEASE_NOTES_URL,
                                            "_blank",
                                            "noopener"
                                        )
                                    }
                                },
                            ]
                        },
                        {
                            header: "developers",
                            subsections: [
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
                                const {icon, name, contents, onClick} = subsection
                                return <button
                                    key={`section-${index}-sub-${subIndex}`}
                                    className="w-full px-4 py-3 flex hover:bg-neutral-700"
                                    onClick={onClick}
                                >
                                    <div className="w-1/2 text-left">
                                        <span className="mr-3 text-neutral-400">
                                            <FontAwesomeIcon icon={icon}/>
                                        </span>
                                        {name}
                                    </div>
                                    <div className="w-1/2 text-right text-neutral-400 overflow-x-clip text-ellipsis whitespace-nowrap">
                                        {contents}
                                    </div>
                                </button>
                            })}
                        </div>
                    })}
                </div>
            </div>
        </div>
        <div className="hidden md:block w-2/3 py-5 h-full bg-neutral-700 animate-fade-in-left">
            <div className="w-full px-2 flex max-w-3xl items-center justify-start">
                <div className="w-1/2 bg-green-500">

                </div>
                <div className="w-1/2 text-right">
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
            </div>
            <div className="w-full h-4/5 flex items-center justify-center">
                <div className="w-full text-center">
                    <div className="text-4xl mb-2 text-yellow-500">
                        <FontAwesomeIcon icon={faFaceLaughSquint} />
                    </div>
                    <div>
                        Nothing here yet...
                    </div>
                </div>
            </div>
        </div>
    </div>
}

export default SettingsPage