import {lazyComponent} from "../../components/Lazy"
import {Skeleton} from "@mui/material"

const tabSkeleton = <div className="max-w-lg">
	{new Array<number>(8).fill(1).map((_, index) => {
		return <div
			key={`settings-tab-skeleton-${index}`}
			className="mb-1"
		>
			<Skeleton 
				animation="wave"
				height={35}
			/>
		</div>
	})}
</div>

const userProfile = lazyComponent(
	async () => (await import("./UserProfile")).userProfile,
	{loadingElement: tabSkeleton}
)
const acknowledgments = lazyComponent(
	async () => (await import("./Acknowledgments")).Acknowledgments,
	{loadingElement: tabSkeleton}
)
const developerOptions = lazyComponent(
	async () => (await import("./DeveloperOptions")).DeveloperOptions,
	{loadingElement: tabSkeleton}
)

export const SubPageList = {
	userProfile,
	acknowledgments,
	developerOptions
}