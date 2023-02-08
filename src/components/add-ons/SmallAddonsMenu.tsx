import {
    Tooltip,
    Menu,
    MenuItem
} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faPuzzlePiece, 
    faArrowLeft,
    faBars,
    faGear,
} from "@fortawesome/free-solid-svg-icons"
import { useState } from "react"
import { Link } from "react-router-dom"

export type SmallAddonsMenuProps = {
    onShowSettings: () => unknown
}

export const SmallAddonsMenu = ({
    onShowSettings
}: SmallAddonsMenuProps): JSX.Element => {
    const [menuElement, setMenuElement] = useState<HTMLElement | null>(null)

    return <div className="flex my-2 text-2xl px-1">
        <div className="w-1/3">
            <Tooltip title="Menu" placement="left">
                <Link to="/start">
                    <button>
                        <FontAwesomeIcon icon={faArrowLeft}/>
                    </button>
                </Link>
            </Tooltip>
        </div>
        <div className="w-1/3 text-center">    
            <span className="text-green-500 mr-2">
                <FontAwesomeIcon icon={faPuzzlePiece} />
            </span>
            <span className="text-base">
                {"Add-ons"}
            </span>
        </div>
        <div className="w-1/3 text-right">
            <Tooltip title="Menu" placement="left">
                <button
                    onClick={(event) => setMenuElement(event.currentTarget)}
                >
                    <FontAwesomeIcon icon={faBars}/>
                </button>
            </Tooltip>

            <Menu
                anchorEl={menuElement}
                open={!!menuElement}
                onClose={() => setMenuElement(null)}
            >
                <MenuItem
                    onClick={onShowSettings}
                >
                    <span className="mr-4">
                        <FontAwesomeIcon icon={faGear}/>
                    </span>
                    {"Settings"}
                </MenuItem>
            </Menu>
        </div>
    </div>
}