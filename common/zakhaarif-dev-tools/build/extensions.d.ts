import type { TerminalActions, wRpc, TransferValue } from "w-worker-rpc";
export type FileTransfer = {
    readonly type: string;
    readonly length: string;
    readonly body: ReadableStream<Uint8Array>;
};
export type InitialExtensionState = {
    configuredPermissions: boolean;
    queryState: string;
    rootUrl: string;
    recommendedStyleSheetUrl: string;
};
export type FatalErrorConfig = {
    details: string;
};
export type EssentialDaemonRpcs = {
    getFile: (url: string) => Promise<TransferValue<FileTransfer> | null>;
    getInitialState: (_: null) => InitialExtensionState;
    secureContextEstablished: (_: null) => boolean;
    signalFatalError: (config: FatalErrorConfig) => boolean;
    readyForDisplay: (_: null) => boolean;
    exit: (_: null) => Promise<boolean>;
};
export type ReconfigurationConfig = {
    canonicalUrls: string[];
};
export type EmbedAnyExtensionDaemonRpcs = {
    reconfigurePermissions: (paramaters: ReconfigurationConfig) => boolean;
};
export type ManualSave = 1;
export type AutoSave = 2;
export type QuickSave = 3;
export type SaveType = (ManualSave | AutoSave | QuickSave);
export type SaveData = {
    id: number;
    name: string;
    type: SaveType;
    mods: {
        canonicalUrls: string[];
        resolvedUrls: string[];
        entryUrls: string[];
    };
};
export type GameSaveDaemonRpcs = {
    getSaveFile: (id: number) => Promise<SaveData | null>;
    createSave: (_: null) => number;
};
export type DaemonRpcs = (EssentialDaemonRpcs & GameSaveDaemonRpcs & EmbedAnyExtensionDaemonRpcs);
export type MessageAppShell = wRpc<DaemonRpcs, {}>["execute"];
export type MainScriptArguments = {
    rootElement: HTMLDivElement;
    initialState: InitialExtensionState;
    messageAppShell: MessageAppShell;
    addRpcResponses: (responses: TerminalActions<{}>) => boolean;
    logPrivateDeps: () => void;
};
export type ExtensionModule = {
    main: (args?: MainScriptArguments) => any;
};
