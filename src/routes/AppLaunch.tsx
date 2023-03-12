import {useEffect} from "react"
import {useNavigate} from "react-router-dom"
import {useToMainMenu} from "../hooks/toMainMenu"
import {bismillah} from "../lib/utils/consts/arabic"

const AppLaunchPage = () => {
	const navigate = useNavigate()
	useToMainMenu()

	useEffect(() => {
		const milliseconds = 1_500
		const navId = setTimeout(() => navigate("/made-with"), milliseconds)
		return () => clearTimeout(navId)
	}, [])

	return <>
		<div 
			className="relative text-center z-0 w-screen h-screen flex justify-center items-center"
		>
			<div className={"w-full"}>
				<div className="text-center text-neutral-400 text-3xl sm:text-4xl">
					{bismillah}
				</div>
			</div>
		</div>
	</>
}

export default AppLaunchPage