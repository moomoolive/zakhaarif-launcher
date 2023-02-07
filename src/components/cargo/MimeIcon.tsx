import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faImage,
    faFilm,
    faFile
} from "@fortawesome/free-solid-svg-icons"
import {faJs, faCss3, faHtml5} from "@fortawesome/free-brands-svg-icons"
import type {Mime} from "../../lib/miniMime/index"

export type MimeIconProps = {
    mime: Mime,
    className?: string
}

export const MimeIcon = ({mime, className = ""}: MimeIconProps) => {
    if (mime.startsWith("image/")) {
        return <span className={`${className} text-indigo-500`}>
            <FontAwesomeIcon 
                icon={faImage}
            />
        </span>
    }
    if (mime.startsWith("video/")) {
        return <span className={`${className} text-red-500`}>
            <FontAwesomeIcon 
                icon={faFilm}
            />
        </span>
    }
    switch (mime) {
        case "application/wasm":
            return <span className={`${className}`}>
                <img
                    src="logos/webassembly.svg"
                    width="16px"
                    height="16px"
                    className="inline-block"
                />
            </span>
        case "text/html":
            return <span className={`${className} text-orange-500`}>
                <FontAwesomeIcon 
                    icon={faHtml5}
                />
            </span>
        case "application/json":
            return <span className={`${className} text-yellow-500`}>
                {"{ }"}
            </span>
        case "text/javascript":
            return <span className={`${className} text-yellow-500`}>
                <FontAwesomeIcon 
                    icon={faJs}
                />
            </span>
        case "text/css":
            return <span className={`${className} text-blue-600`}>
                <FontAwesomeIcon 
                    icon={faCss3}
                />
            </span>
        default:
            return <span className={`${className}`}>
                <FontAwesomeIcon 
                    icon={faFile}
                />
            </span>
    }
}