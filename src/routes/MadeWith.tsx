import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
	faJs, 
	faCss3, 
	faHtml5,
	faReact,
	faOsi,
} from "@fortawesome/free-brands-svg-icons"
import {useEffect} from "react"
import {useNavigate, Link} from "react-router-dom"
import {Tooltip} from "@mui/material"
import {SETTINGS_TAB} from "../lib/utils/searchParameterKeys"
import {useToMainMenu} from "../hooks/toMainMenu"

const AppLaunchPage = () => {
	const navigate = useNavigate()
	useToMainMenu()

	useEffect(() => {
		const milliseconds = 3_000
		const navId = setTimeout(() => navigate("/start"), milliseconds)
		return () => clearTimeout(navId)
	}, [])

	return <>
		<div 
			className="relative text-center z-0 w-screen h-screen flex justify-center items-center"
		>
			<div className={"w-full"}>
				<div className="text-center text-neutral-400 text-xl mb-8">
                    Made with
				</div>

				<div className="flex items-center justify-center relative flex-wrap w-4/5 mx-auto">
					{([
						{icon: faJs, className: "text-yellow-500 animate-bounce", title: "Javascript", link: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/First_steps/What_is_JavaScript"},
						{icon: faCss3, className: "text-blue-600 animate-wiggle", title: "CSS", link: "https://www.w3.org/Style/CSS/Overview.en.html"},
						{icon: faHtml5, className: "text-orange-500 animate-pulse", title: "HTML", link: "https://www.w3.org/standards/webdesign/htmlcss.html"},
						{icon: faReact, className: "text-blue-400 animate-spin-slow", title: "React", link: "https://reactjs.org/"},
					] as const).map((metadata, i) => {
						const {icon, className, title, link} = metadata
						return <div
							key={`icon-${i}`}
							className={`${className} mr-8 text-6xl mb-4`}
						>
							<a
								href={link}
								target="_blank"
								rel="noopener"
							>
								<Tooltip title={title}>
									<FontAwesomeIcon icon={icon}/>
								</Tooltip>
							</a>
						</div>
					})}

					<div>
						<a 
							href="https://www.babylonjs.com/" 
							target="_blank"
							rel="noopener"
						>
							<Tooltip title="Babylon.js">
								<img 
									src="logos/babylon_logo_color.png"
									width={64}
									height={64}
									className="mb-3 animate-swing mr-8"
								/>
							</Tooltip>
						</a>
					</div>
                
					<div className={"text-green-500 text-6xl mb-4 mr-8"}>
						<Link to={`/settings?${SETTINGS_TAB}=acknowledgments`} target="_blank">
							<Tooltip title="Many other open-source projects">
								<FontAwesomeIcon icon={faOsi}/>
							</Tooltip>
						</Link>
					</div>
				</div>
			</div>
		</div>
	</>
}

export default AppLaunchPage