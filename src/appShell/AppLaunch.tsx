import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faJs, 
    faCss3, 
    faHtml5,
    faReact,
} from "@fortawesome/free-brands-svg-icons"
import {useEffect} from "react"
import {useNavigate} from "react-router-dom"

const AppLaunchPage = () => {
    const navigate = useNavigate()

    useEffect(() => {
        const navId = setTimeout(() => navigate("/start"), 2_500)
        return () => clearTimeout(navId)
    }, [])

    return <>
        <div 
            className="relative text-center z-0 w-screen h-screen flex justify-center items-center"
        >
            <div className="w-full">
                <div className="text-center text-neutral-400 text-xl mb-5">
                    Made with
                </div>

                <div className="flex items-center justify-center relative flex-wrap w-4/5 mx-auto">
                    {([
                        {icon: faJs, className: "text-yellow-500 animate-bounce"},
                        {icon: faCss3, className: "text-blue-600 animate-wiggle"},
                        {icon: faHtml5, className: "text-orange-500 animate-pulse"},
                        {icon: faReact, className: "text-blue-400 animate-spin-slow"},
                    ] as const).map(({icon, className}, i) => {
                        return <div
                            key={`icon-${i}`}
                            className={`${className} mr-8 text-6xl mb-4`}
                        >
                            <FontAwesomeIcon icon={icon}/>
                        </div>
                    })}
                    <div>
                        <img 
                            src="babylon_logo_color.png"
                            width={64}
                            height={64}
                            className="mb-3 animate-swing"
                        />
                    </div>
                </div>
            </div>
        </div>
    </>
}

export default AppLaunchPage