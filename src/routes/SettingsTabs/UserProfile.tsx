import {useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faCheck} from "@fortawesome/free-solid-svg-icons"
import {TextField} from "@mui/material"
import {useDebounce} from "../../hooks/debounce"
import {LOCAL_STORAGE_KEYS} from "../../lib/consts"

const {PROFILE_NAME} = LOCAL_STORAGE_KEYS

export function userProfile(): JSX.Element {
	const optionsDebounce = useDebounce(500)

	const [profileName, setProfileName] = useState((() => {
		const previous = localStorage.getItem(PROFILE_NAME) || ""
		if (previous.length > 0) {
			return previous
		}
		return "default"
	})())
	const [peristenceLoading, setPersistenceLoading] = useState(false)

	return <div>
		<div>
			<TextField
				id="profile-name-input"
				name="profile-name"
				label="Profile Name"
				value={profileName}
				onChange={(event) => {
					setProfileName(event.target.value)
					setPersistenceLoading(true)
					optionsDebounce(() => {
						localStorage.setItem(PROFILE_NAME, event.target.value)
						setPersistenceLoading(false)
					})
				}}
				helperText={
					peristenceLoading 
						? <span className="animate-pulse">{"Loading..."}</span>
						: <span className="text-green-500">
							<span className="mr-2">
								<FontAwesomeIcon icon={faCheck}/> 
							</span>
                            Saved
						</span>
				}
			/>
		</div>
	</div>
}