import {Shabah} from "@/lib/shabah/wrapper"
import {APP_CACHE} from "@/config"
import {webAdaptors} from "@/lib/shabah/adaptors/web-preset"
import {useRef} from "react"
import {usePromise} from "@/hooks/promise"
import {FullScreenLoadingOverlay} from "@/components/loadingOverlay"
import {ErrorOverlay} from "@/components/errorOverlay"
import { Button } from "@mui/material"
import {useNavigate} from "react-router-dom"

const AddOns = () => {
    const navigate = useNavigate()

    const {current: downloadClient} = useRef(new Shabah({
        origin: location.origin,
        ...webAdaptors(APP_CACHE)
    }))
    const cargoIndex = usePromise(downloadClient.getCargoIndices())

    return <FullScreenLoadingOverlay 
        loading={cargoIndex.loading}
        minimumLoadTimeMilliseconds={1_000}
    >
        {!cargoIndex.data.ok ? <ErrorOverlay>
            <div className="text-gray-400 mb-1">
                An error occurred when search for files
            </div>
            <Button onClick={() => navigate("/start")}>
                Back to Home
            </Button>
        </ErrorOverlay> : <>
            hello world
        </>}
        
    </FullScreenLoadingOverlay>
}

export default AddOns