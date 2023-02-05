import {
    Tooltip, 
    IconButton, 
    ClickAwayListener, 
    TextField, 
    Button
} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faArrowLeft} from "@fortawesome/free-solid-svg-icons"
import { useMemo, useState } from "react"
import { useDebounce } from "../../hooks/debounce"
import { isUrl } from "../../lib/utils/urls/isUrl"

export type InstallerProps = {
    onClose: () => void
}

type InvalidType = (
    "malformed-url"
    | "analyzing"
    | "none"
)

export const Installer = ({
    onClose
}: InstallerProps): JSX.Element => {
    const urlCheck = useDebounce(800)

    const [url, setUrl] = useState("")
    const [invalidation, setInvalidation] = useState<InvalidType>("none")

    const updateUrl = (nextUrl: string) => {
        setUrl(nextUrl)
        setInvalidation("analyzing")
        urlCheck(() => {
            const correctUrl = isUrl(nextUrl)
            if (correctUrl) {
                setInvalidation("none")
            } else {
                setInvalidation("malformed-url")
            }
        })
    }

    const packageHelperText = useMemo(() => {
        switch (invalidation) {
            case "malformed-url":
                return <>{"Invalid url"}</>
            case "analyzing":
                return <span className="animate-pulse">{"Loading..."}</span>
            default:
                return <>{" "}</>
        }
    }, [invalidation])

    return <div className="fixed bg-neutral-900/80 z-20 w-screen h-screen overflow-clip flex items-center justify-center">
        <div className="absolute top-0 left-0">
            <div className="ml-2 mt-2">
                <Tooltip title="Back">
                    <IconButton>
                        <FontAwesomeIcon icon={faArrowLeft}/>
                    </IconButton>
                </Tooltip>
            </div>
        </div>

        <ClickAwayListener onClickAway={onClose}>
            <div className="w-5/6 max-w-xl py-2 animate-fade-in-left rounded bg-neutral-800">
                <form 
                    onSubmit={(event) => {
                        event.preventDefault()
                    }}
                    className="px-3 pt-4 pb-1"
                >
                    <div className="mb-1 sm:mb-3">
                        <TextField
                            id="cargo-url"
                            fullWidth
                            name="cargo-url"
                            label="Package Url"
                            placeholder="Enter a url..."
                            value={url}
                            error={
                                invalidation !== "none" 
                                && invalidation !== "analyzing"
                            }
                            onChange={(event) => updateUrl(event.target.value)}
                            helperText={packageHelperText}
                        />
                    </div>

                    <div>
                        <Button
                            type="submit"
                            className="w-1/2"
                            disabled={
                                invalidation !== "none" 
                                || url.length < 1
                            }
                        >
                            {"Download"}
                        </Button>

                        <Button
                            className="w-1/2"
                            color="error"
                            onClick={onClose}
                        >
                            {"Cancel"}
                        </Button>
                    </div>
                        
                </form>
            </div>

        </ClickAwayListener>
    </div>
}