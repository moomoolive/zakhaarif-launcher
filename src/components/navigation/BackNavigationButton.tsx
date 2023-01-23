import { Link } from "react-router-dom"
import { Tooltip, IconButton } from "@mui/material"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons"

export type BackNavigationButtonProps = {
    className?: string
}

export const BackNavigationButton = ({
    className = ""
}: BackNavigationButtonProps) => {
    return <div className={"absolute top-0 left-0 " + className}>
        <div className="ml-2 mt-2">
            <Link to="/start">
                <Tooltip title="Back">
                    <IconButton>
                        <FontAwesomeIcon icon={faArrowLeft}/>
                    </IconButton>
                </Tooltip>
            </Link>
        </div>
    </div>
}