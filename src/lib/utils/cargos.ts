import {EXTENSION_CARGO_TAG, MOD_CARGO_TAG} from "../../config"
import {ABORTED, FAILED} from "../shabah/backend"
import {ManifestIndex} from "../shabah/downloadClient"
import {STANDARD_CARGOS} from "../../standardCargos"

const standardCargoMap = new Map(
	STANDARD_CARGOS.map((cargo) => [cargo.canonicalUrl, 1])
)

export const isStandardCargo = (cargo: ManifestIndex): boolean => {
	return standardCargoMap.has(cargo.canonicalUrl)
}

export const isMod = (cargo: ManifestIndex): boolean => cargo.tag === MOD_CARGO_TAG

export const isExtension = (cargo: ManifestIndex): boolean => cargo.tag === EXTENSION_CARGO_TAG

export const isInErrorState = (cargo: ManifestIndex): boolean => cargo.state === ABORTED || cargo.state === FAILED 

export const EXTENSION_METADATA_KEY = "is-extension"