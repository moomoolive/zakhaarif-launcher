import type {DeepReadonly} from "../../types/utility"
import {HuzmaManifest} from "huzma"
import {ManifestIndex, Shabah} from "../../shabah/downloadClient"
import {Permissions} from "../../types/permissions"
import type {AppDatabase} from "../../database/AppDatabase"
import {PermissionsSummary} from "../../utils/security/permissionsSummary"
import type { Logger } from "../../types/app" 

export type SandboxDependencies = DeepReadonly<{
    displayExtensionFrame: () => void
    minimumLoadTime: number
    queryState: string
    createFatalErrorMessage: (msg: string, details: string) => void
    confirmExtensionExit: () => Promise<void>
    cargoIndex: ManifestIndex
    cargo: HuzmaManifest<Permissions>
    recommendedStyleSheetUrl: string
    database: AppDatabase
    origin: string
    logger: Logger
    downloadClient: Shabah
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

export type DaemonRpc = {
    [key: string]: (param: any) => any
}

export type DaemonRpcTransform<Rpcs extends DaemonRpc> = {
    [key in keyof Rpcs]: (
        ...args: [param: Parameters<Rpcs[key]>[0], state: RpcState] 
    ) => ReturnType<Rpcs[key]>
}