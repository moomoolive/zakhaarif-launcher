import type {HuzmaCliConfig} from "huzma"
import type {AllPermissions} from "./permissions"

type stringKey =  string & {}

export type ZakhaarifMetadata = {
    [x: stringKey]: string | undefined;
    /**
    * Tells package manager that package is an 
    * extension. Do not include this metadata
    * you are making a mod.
    */
    "is-extension"?: "true" | undefined;
}

export type HuzmaConfig = (
    Omit<HuzmaCliConfig<AllPermissions>, "metadata"> 
    & {
        metadata?: ZakhaarifMetadata
    }
)