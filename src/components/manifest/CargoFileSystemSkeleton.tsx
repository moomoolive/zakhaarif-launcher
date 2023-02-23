import {Skeleton} from "@mui/material"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {faFile} from "@fortawesome/free-solid-svg-icons"

export const CargoFileSystemSkeleton = <div className="w-full h-5/6 overflow-y-scroll text-center"> 
    {new Array<number>(5).fill(1).map((_, index) => {
        return <div
            key={`cargo-file-member-skeleton-${index}`}
            className="p-4 w-full flex justify-center items-center animate-pulse"
        >
            <div className="w-1/2 text-left flex">
                <div className="mr-2">
                    <FontAwesomeIcon icon={faFile}/>
                </div>
                
                <div className="w-10">
                    <Skeleton animation={false}/>
                </div>
            </div>

            <div className="w-1/2 px-2">
                <Skeleton animation={false}/>
            </div>
        </div>
    })}
</div>