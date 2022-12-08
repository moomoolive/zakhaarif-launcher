import {
    APP_RECORDS,
    APPS_FOLDER,
    LAUNCHER_CARGO
} from "./consts"

export const entryRecords = (windowOrigin: string) => windowOrigin + "/" + APP_RECORDS

export const appFolder = (windowOrigin: string, appId: number) => windowOrigin + "/" + APPS_FOLDER + appId.toString() + "/"

export const launcherCargo = (windowOrigin: string) => windowOrigin + "/" + LAUNCHER_CARGO