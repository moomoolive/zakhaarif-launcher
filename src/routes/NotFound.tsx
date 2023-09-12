import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faMagnifyingGlass} from "@fortawesome/free-solid-svg-icons"
import {Button} from "@mui/material"
import {Link} from "react-router-dom"

export default function NotFoundPage(): JSX.Element {
	return <div className="w-screen h-screen flex items-center justify-center">
		<div className="text-2xl text-yellow-500">
			<div>
				<span className="mr-2">
					<FontAwesomeIcon
						icon={faMagnifyingGlass}
					/>
				</span>
                Page Not found
			</div>
			<div className="mt-6 text-center">
				<Link to="/start">
					<Button size="large">
                        Back to Home
					</Button>
				</Link>
			</div>
		</div>
	</div>
}