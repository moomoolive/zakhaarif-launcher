import {useState, useEffect} from "react"
import {Tooltip} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faScaleBalanced,
    faLink,
    faCodeCommit,
    faCopy,
    faEnvelope,
    faGlobe,
} from "@fortawesome/free-solid-svg-icons"
import {Divider, ClickAwayListener} from "@mui/material"
import {Cargo} from "@/lib/cargo/index"
import {NULL_FIELD as CARGO_NULL_FIELD} from "@/lib/cargo/consts"
import {CargoIcon} from "../../components/cargo/Icon"
import {isStandardCargo} from "../../lib/utils/cargos"

export type CargoInfoProps = {
    onClose: () => void
    cargo: Cargo
    importUrl: string
    id: string
}

export const CargoInfo = ({
    importUrl,
    cargo,
    onClose,
    id,
}: CargoInfoProps) => {
    const {
        name, 
        keywords, 
        version, 
        license, 
        description,
        files,
        crateVersion,
        homepageUrl,
        repo,
        authors,
        crateLogoUrl
    } = cargo

    const noLicense = license === CARGO_NULL_FIELD
    const fileCount = files.length

    const [copiedId, setCopiedId] = useState("none")

    const textToClipboard = (text: string, sectionId: string) => {
        navigator.clipboard.writeText(text)
        setCopiedId(sectionId)
        window.setTimeout(() => {
            setCopiedId("none")
        }, 1_000)
    }

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const {key} = event
            if (key.toLowerCase() === "escape") {
                onClose()
            }
        }
        window.addEventListener("keyup", handler)
        return () => window.removeEventListener("keyup", handler)
    }, [])

    const keywordList = isStandardCargo(id)
        ? ["core", ...keywords.slice(0, 5)]
        : keywords.slice(0, 6).filter((word) => word !== "core")

    return <div className="fixed bg-neutral-900/80 z-20 w-screen h-screen overflow-clip flex items-center justify-center">
        <ClickAwayListener onClickAway={onClose}>
        <div className="w-5/6 max-w-xl py-3 rounded bg-neutral-800">
            <div className="w-full pl-3">
                <div className="flex justify-start pb-3">
                    <CargoIcon 
                        importUrl={importUrl}
                        crateLogoUrl={crateLogoUrl}
                        pixels={80}
                        className="mr-4 animate-fade-in-left"
                    />

                    <div className="mt-1 w-3/4">
                        <Tooltip title={name}>
                            <div className="text-xl overflow-x-clip whitespace-nowrap text-ellipsis">
                                {name}
                            </div>
                        </Tooltip>
                        <div className="text-xs mb-0.5 text-neutral-400">
                            {`v${version}`}
                        </div>
                        <div className="text-xs mb-0.5 text-neutral-400">
                            <span className={`mr-1 ${noLicense ? "" : "text-green-500"}`}>
                                <FontAwesomeIcon icon={faScaleBalanced}/>
                            </span>
                            {noLicense ? "no license" : license}
                        </div>
                        <div className="text-xs text-neutral-400">
                            
                        </div>
                    </div>
                </div>

                <div className="overflow-y-scroll py-2 h-48 md:h-60 lg:h-72 w-full">
                    <div>
                        {description}
                    </div>
                    <div className="my-3">
                        <Divider className=" bg-neutral-700"/>
                    </div>
                    <div className="text-neutral-300">
                        {authors.length > 0 ? <>
                            <div className="mb-2">
                                <div className="text-xs text-neutral-500">
                                    {`Author${authors.length > 1 ? "s" : ""}:`}
                                </div>
                                {authors.map((author, index) => {
                                    const {name, email, url} = author
                                    return <div
                                        key={`cargo-author-${index}`}
                                        className="text-sm"
                                    >
                                        {email !== CARGO_NULL_FIELD ? <a
                                            href={`mailto:${email}`}
                                            className="hover:text-green-500 text-neutral-400 cursor-pointer"
                                        >
                                            <span
                                                className="mr-2"
                                            >
                                                <FontAwesomeIcon icon={faEnvelope} />
                                            </span>
                                        </a> : <></>}
                                        {url !== CARGO_NULL_FIELD ? <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener"
                                            className="hover:text-green-500 cursor-pointer text-neutral-400"
                                        >
                                            <span
                                                className="mr-2"
                                            >
                                                <FontAwesomeIcon icon={faLink} />
                                            </span>
                                        </a> : <></>}
                                        <span>
                                            {name}
                                        </span>
                                    </div>
                                })}
                            </div>
                        </> : <></>}

                        <div className="mb-2">
                            <div className="text-neutral-500 text-xs">
                                {`Permissions:`}
                            </div>
                            <div className="text-sm">
                                none
                            </div>
                        </div>

                        <div className="text-xs mb-2">
                            <div className="text-neutral-500 text-xs">
                                {`Metadata:`}
                            </div>
                            <div className="text-sm">
                                <span className="mr-1">
                                    {fileCount}
                                </span>
                                <span>
                                    files
                                </span>
                                <span className="ml-3">
                                    {`crate v${crateVersion}`}
                                </span>
                            </div>
                        </div>

                        <div className="text-sm text-neutral-400 mt-4">
                            <div>
                                <a 
                                    className="hover:text-green-500 mr-4 cursor-pointer"
                                    onClick={() => textToClipboard(importUrl, "import-url")}
                                >
                                    {copiedId === "import-url" ? <>
                                        <span className="mr-2">
                                            <FontAwesomeIcon icon={faCopy}/>
                                        </span>
                                        {"Copied!"}
                                    </> : <>
                                        <span className="mr-1">
                                            <FontAwesomeIcon icon={faLink}/>
                                        </span>
                                        {"Copy Import Url"}
                                    </>}
                                </a>
                            </div>
                        </div>
                    </div>

                    
                </div>
            </div>

            <div className="pt-3">
                {keywordList.length > 0 ? <>
                    <div className="flex w-full px-3 items-center justify-start flex-wrap">
                        {keywordList.map((keyword, index) => {
                            return <div
                                key={`keyword-${index}`}
                                className={`mr-2 mb-2 text-xs rounded-full py-1 px-2 ${keyword === "core" ? "bg-blue-500 hover:bg-blue-600" : "bg-neutral-700 hover:bg-neutral-600"}`}
                            >
                                {keyword}
                            </div>
                        })}
                    </div>
                </> : <></>}

                {homepageUrl !== CARGO_NULL_FIELD || repo.url !== CARGO_NULL_FIELD ? <>
                    <div className="text-sm py-1 px-3">
                        {homepageUrl !== CARGO_NULL_FIELD ? <>
                            <a 
                                href={homepageUrl} 
                                target="_blank" 
                                rel="noopener"
                                className="hover:text-green-500 mr-4"
                            >
                                <span className="mr-1">
                                    <FontAwesomeIcon icon={faGlobe}/>
                                </span>
                                website
                            </a>
                        </> : <></>}

                        {repo.url !== CARGO_NULL_FIELD ? <>
                            <a 
                                href={homepageUrl} 
                                target="_blank" 
                                rel="noopener"
                                className="hover:text-green-500 mr-4"
                            >
                                <span className="mr-1">
                                    <FontAwesomeIcon icon={faCodeCommit}/>
                                </span>
                                repo
                            </a>
                        </> : <></>}
                    </div>
                </> : <></>}
            </div>
        </div>
        </ClickAwayListener>
    </div>
}