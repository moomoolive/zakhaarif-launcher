import type {DeepReadonly} from "../../types/utility"
import {Cargo} from "../../cargo/index"
import {CargoIndex} from "../../shabah/downloadClient"
import {Permissions} from "../../types/permissions"
import type {AppDatabase} from "../../database/AppDatabase"
import {PermissionsSummary} from "../../utils/security/permissionsSummary"
import {AppLogger} from "../../utils/initAppStore"
import type { Logger } from "../../types/app" 

export type SandboxDependencies = DeepReadonly<{
    displayExtensionFrame: () => void
    minimumLoadTime: number
    queryState: string
    createFatalErrorMessage: (msg: string) => void
    confirmExtensionExit: () => Promise<void>
    cargoIndex: CargoIndex
    cargo: Cargo<Permissions>
    recommendedStyleSheetUrl: string
    database: AppDatabase
    origin: string
    logger: Logger
}>

export type SandboxMutableState = {
    readyForDisplay: boolean;
    secureContextEstablished: boolean;
    minimumLoadTimePromise: Promise<boolean>;
    fatalErrorOccurred: boolean;
    permissionsSummary: PermissionsSummary
    authToken: string;
}

export type RpcPersistentState = {
    configuredPermissions: boolean
    setEmbedUrls: (canonicalUrls: string[]) => unknown
}

export type RpcState = (
    SandboxDependencies 
    & SandboxMutableState
    & {persistentState: RpcPersistentState}
)