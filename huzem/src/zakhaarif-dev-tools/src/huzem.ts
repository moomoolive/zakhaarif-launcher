import type {HuzmaCliConfig} from "huzma"
import type {AllPermissions} from "./permissions"

type AnyString =  string & {}

export type ZakhaarifMetadata = {
    [x: AnyString]: string | undefined;
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