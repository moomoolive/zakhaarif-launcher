import {useState, useMemo, useRef} from "react"
import {Collapse, Tooltip} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
	faScaleBalanced,
	faLink,
	faCodeCommit,
	faCopy,
	faEnvelope,
	faGlobe
} from "@fortawesome/free-solid-svg-icons"
import {Divider} from "@mui/material"
import {
	HuzmaManifest,
	NULL_FIELD as CARGO_NULL_FIELD
} from "huzma"
import {CargoIcon} from "../../components/manifest/Icon"
import {isStandardCargo} from "../../lib/utils/cargos"
import {ManifestIndex} from "../../lib/shabah/downloadClient"
import {reactiveDate} from "../../lib/utils/dates"
import {MOD_CARGO_TAG, EXTENSION_CARGO_TAG} from "../../config"
import {
	Permissions, 
	permissionsMeta, 
	ALLOW_ALL_PERMISSIONS
} from "../../lib/types/permissions"
import {cleanPermissions} from "../../lib/utils/security/permissionsSummary"
import {readableByteCount} from "../../lib/utils/storage/friendlyBytes"
import {PermissionsDisplay} from "./PermissionsDisplay"
import {useGlobalConfirm} from "../../hooks/globalConfirm"

type PreventableEvent = {
    preventDefault: () => unknown
}

export type CargoSummaryProps = {
    cargo: HuzmaManifest<Permissions>
    cargoIndex: ManifestIndex
    showModificationMetadata?: boolean
    showImportLinkCopy?: boolean
    safeExternalNavigation?: boolean
}

const SHRUNK_DESCRIPTION_CHARACTER_COUNT = 150

export const CargoSummary = ({
	cargo,
	cargoIndex,
	showModificationMetadata = false,
	showImportLinkCopy = false,
	safeExternalNavigation = false
}: CargoSummaryProps): JSX.Element => {
	const confirm = useGlobalConfirm()

	const {resolvedUrl, updated, bytes} = cargoIndex 
	const {
		name, 
		keywords, 
		version, 
		license, 
		description,
		files,
		schema,
		homepageUrl,
		repo,
		authors,
		crateLogoUrl,
		permissions,
	} = cargo

	const noLicense = license === CARGO_NULL_FIELD
	const fileCount = files.length
	const friendlyBytes = readableByteCount(bytes)

	const [copiedId, setCopiedId] = useState("none")
	const [expandText, setExpandText] = useState(false)

	const {current: safeNavigate} = useRef(async (
		event: PreventableEvent, 
		url: string
	) => {
		if (!safeExternalNavigation) {
			return
		}
		event.preventDefault()
		if (!await confirm({title: "Are you sure you want to navigate to an external website?", confirmButtonColor: "warning"})) {
			return
		}
		window.open(url, "_blank", "noopener")
	})

	const textToClipboard = (text: string, sectionId: string) => {
		navigator.clipboard.writeText(text)
		setCopiedId(sectionId)
		window.setTimeout(() => {
			setCopiedId("none")
		}, 1_000)
	}

	const standardKeywords = useMemo(() => {
		const tag = cargoIndex.tag
		const standardKeywordsList = []
		if (isStandardCargo(cargoIndex)) {
			standardKeywordsList.push({text: "core", type: "std"})
		}
		if (tag === MOD_CARGO_TAG) {
			standardKeywordsList.push({text: "mod", type: "mod"})
		}
		if (tag === EXTENSION_CARGO_TAG) {
			standardKeywordsList.push({text: "extension", type: "ext"})
		}
		return standardKeywordsList
	}, [cargo])

	const permissionsFiltered = useMemo(() => {
		const allowAll = permissions.some((permission) => permission.key === ALLOW_ALL_PERMISSIONS)
		if (allowAll) {
			return [{key: ALLOW_ALL_PERMISSIONS, value: [] as string[]}] as typeof permissions
		}

		const preFiltered = cleanPermissions(permissions).filter(
			({key}) => !permissionsMeta[key].implicit
		)
		const extendableDangerousPermissions = preFiltered.filter(
			({key}) => permissionsMeta[key].dangerous && permissionsMeta[key].extendable
		)
		const dangerousPermissions = preFiltered.filter(
			({key}) => permissionsMeta[key].dangerous && !permissionsMeta[key].extendable
		)
		const safePermissions = preFiltered.filter(
			({key}) => !permissionsMeta[key].dangerous
		)
		return [
			...extendableDangerousPermissions, 
			...dangerousPermissions, 
			...safePermissions
		]
	}, [cargo])

	const hasFooter = (
		homepageUrl !== CARGO_NULL_FIELD 
        || repo.url !== CARGO_NULL_FIELD
	)

	return <div className="w-full">
		<div className="w-full pl-3">
			<div className="flex justify-start pb-3">
				<CargoIcon 
					importUrl={resolvedUrl}
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
				</div>
			</div>

			<div className="overflow-y-scroll py-2 h-48 md:h-60 lg:h-72 w-full">
				<div>
					{description.length <= SHRUNK_DESCRIPTION_CHARACTER_COUNT
						? <>{description}</>
						: <>
							{expandText ? <Collapse in={true}>
								<span className="mr-1">
									{description}
								</span>
								<button 
									className={"text-red-500 text-sm hover:text-red-400"}
									onClick={() => setExpandText(false)}
								>
									{"less"}
								</button>
							</Collapse> : <>
								<span className="mr-1">
									{`${description.slice(0, SHRUNK_DESCRIPTION_CHARACTER_COUNT)}...`}
								</span>
								<button 
									className={"text-blue-500 text-sm hover:text-blue-400"}
									onClick={() => setExpandText(true)}
								>
									{"more"}
								</button>
							</>}
						</>
					}
                    
				</div>
				<div className="mt-3 mb-1">
					<Divider className=" bg-neutral-700"/>
				</div>

				{showModificationMetadata ? <>
					<div className="text-xs text-neutral-400">
						{"Updated: " + reactiveDate(new Date(updated))}
					</div>
				</> : <></>}
                

				<div className="text-sm text-neutral-400 my-3">
					<div>
						{showImportLinkCopy ? <>
							<button 
								className="hover:text-green-500 mr-4 cursor-pointer"
								onClick={() => textToClipboard(resolvedUrl, "import-url")}
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
							</button>
						</> : <></>}
					</div>
				</div>

				<div className="text-neutral-300">
					{authors.length > 0 ? <>
						<div className="mb-2">
							<div className="text-xs text-neutral-500">
								{`Author${authors.length > 1 ? "s" : ""}:`}
							</div>
							{authors.map((author, index) => {
								const {name: authorName, email, url} = author
								return <div
									key={`cargo-author-${index}`}
									className="text-sm"
								>
									{email !== CARGO_NULL_FIELD ? <a
										href={`mailto:${email}`}
										className="hover:text-green-500 text-neutral-400 cursor-pointer"
									>
										<span className="mr-2">
											<FontAwesomeIcon icon={faEnvelope} />
										</span>
									</a> : <></>}
									{url !== CARGO_NULL_FIELD ? <a
										href={url}
										onClick={(event) => safeNavigate(event, url)}
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
										{authorName}
									</span>
								</div>
							})}
						</div>
					</> : <></>}

					<div className="mb-2 w-full">
						<div className="text-neutral-500 text-xs">
							{"Permissions:"}
						</div>
                        
						{permissions.length < 1 ? <div className="text-sm">
                                none
						</div> : <>
							<div className="w-full px-1">
								{permissionsFiltered.map((permission, index) => {
									return <PermissionsDisplay 
										key={`permission-${index}`}
										permission={permission}
									/>
								})}
							</div>
						</>}
					</div>

					<div className="text-xs mb-1">
						<div className="text-neutral-500 text-xs">
							{"Metadata:"}
						</div>
						<div className="text-sm mb-1">
							<div>
								{`${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`}
								<span className="ml-1 text-neutral-500 text-xs">
									{`(${fileCount} file${fileCount > 1 ? "s" : ""})`}
								</span>
							</div>

							<div>
								{`schema v${schema}`}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div className={`pt-3 ${!hasFooter ? "mb-1" : ""}`}>
			{keywords.length > 0 || standardKeywords.length > 0 ? <>
				<div className="flex w-full px-3 items-center justify-start flex-wrap">
					{standardKeywords.map(({text: keyword, type}, index) => {
						return <div
							key={`keyword-${index}`}
							className={`mr-2 mb-2 text-xs rounded-full py-1 px-2 ${
								type === "std" 
									? "bg-blue-500 hover:bg-blue-600" 
									: type === "mod" ? "bg-indigo-700 hover:bg-indigo-600" : "bg-green-700 hover:bg-green-600"
							}`}
						>
							{keyword}
						</div>
					})}
                    
					{keywords.slice(0, 5).map((keyword, index) => {
						return <div
							key={`keyword-${index}`}
							className={"mr-2 mb-2 text-xs rounded-full py-1 px-2 bg-neutral-700 hover:bg-neutral-600"}
						>
							{keyword}
						</div>
					})}
				</div>
			</> : <></>}

			{hasFooter ? <>
				<div className="text-sm py-1 px-3">
					{homepageUrl !== CARGO_NULL_FIELD ? <>
						<a 
							href={homepageUrl}
							onClick={(event) => safeNavigate(event, homepageUrl)}
							target="_blank" 
							rel="noopener"
							className="hover:text-green-500 mr-4"
						>
							<span className="mr-1 text-green-500">
								<FontAwesomeIcon icon={faGlobe}/>
							</span>
                            website
						</a>
					</> : <></>}

					{repo.url !== CARGO_NULL_FIELD ? <>
						<a 
							href={repo.url}
							onClick={(event) => safeNavigate(event, repo.url)}
							target="_blank"
							rel="noopener"
							className=" hover:text-green-500 mr-4"
						>
							<span className="text-green-500 mr-1">
								<FontAwesomeIcon icon={faCodeCommit}/>
							</span>
                            repo
						</a>
					</> : <></>}
				</div>
			</> : <></>}
		</div>
	</div>
}