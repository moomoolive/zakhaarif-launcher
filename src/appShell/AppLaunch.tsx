import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faJs, 
    faCss3, 
    faHtml5,
    faReact,
} from "@fortawesome/free-brands-svg-icons"
import {useEffect} from "react"
import {useNavigate} from "react-router-dom"

export const AppLaunch = () => {
    const navigate = useNavigate()

    useEffect(() => {
        const id = setTimeout(() => navigate("/start"), 2_500)
        return () => clearTimeout(id)
    }, [])

    return <>
        <div className="relative text-center z-0 w-screen h-screen flex justify-center items-center">
            <div className="w-full">
                <div className="text-center text-gray-400 text-xl mb-5">
                    Made with
                </div>

                <div className="flex items-center justify-center relative flex-wrap w-4/5 mx-auto">
                    {([
                        {icon: faJs, className: "text-yellow-500"},
                        {icon: faCss3, className: "text-blue-600"},
                        {icon: faHtml5, className: "text-orange-500"},
                        {icon: faReact, className: "text-blue-400"},
                    ] as const).map(({icon, className}, i) => {
                        return <div
                            key={`icon-${i}`}
                            className={`${className} mr-8 text-5xl sm:text-6xl mb-4`}
                        >
                            <FontAwesomeIcon icon={icon}/>
                        </div>
                    })}
                </div>
            </div>
        </div>
    </>
}