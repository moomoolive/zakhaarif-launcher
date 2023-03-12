import {useEffect} from "react"
import {useNavigate} from "react-router-dom"

export function useToMainMenu() {
	const navigate = useNavigate()

	useEffect(() => {
		const toMenu = () => navigate("/start")
		window.addEventListener("keydown", toMenu)
		window.addEventListener("click", toMenu)
		return () => {
			window.removeEventListener("keydown", toMenu)
			window.removeEventListener("click", toMenu)
		} 
	}, [])
}