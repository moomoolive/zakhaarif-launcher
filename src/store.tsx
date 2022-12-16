import {createContext, useContext} from "react"
import type {Shabah} from "../shabah/index"

type Store = {
    launchApp: () => void
    downloadClient: Shabah
    setTerminalVisibility: (visible: boolean) => void
}

export const storeContext = createContext<Store>(
    undefined as unknown as Store
)

export const useStoreContext = () => useContext(storeContext)