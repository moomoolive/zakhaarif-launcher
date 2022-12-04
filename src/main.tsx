import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import {
  dom_hooks,
  CURRENT_APP_ENTRY_PARAMS,
  APP_CACHE
} from "../sharedLib/consts"
import type {
  AppEntryPointer,
  AppExtensionModule
} from "../sharedLib/types"

const enum log {
  name = "[🤖 app-controller]:",
  sw = "[💾 service-worker]:"
}

if (navigator.serviceWorker) {
  const url = import.meta.env.PROD 
    ? "dev-sw.js"
    : "dev-sw.js"
  navigator.serviceWorker.register(url, {
    scope: "/"
  })
  navigator.serviceWorker.addEventListener("message", (msg) => {
    const {data} = msg
    const d = data as {type: "error" | "info", contents: string}
    if (d.type === "info") {
      console.info(log.sw, d.contents)
    } else {
      console.error(log.sw, d.contents)
    }
  })
}

const root = document.getElementById(dom_hooks.root_div) as HTMLElement
const launcherRoot = ReactDOM.createRoot(root)

launcherRoot.render(
  <React.StrictMode>
    <App
      openApp={async () => {
        console.info(log.name, "launcher has requested opening of application shell")
        const appEntryPtr = await (async (ptrUrl: string) => {
          try {
            const res = await fetch(ptrUrl, {method: "GET"})
            if (!res.ok) {
              return null
            }
            return await res.json() as AppEntryPointer
          } catch {
            return null
          }
        })(CURRENT_APP_ENTRY_PARAMS)
        if (!appEntryPtr) {
          console.error(log.name, `app pointer has not been initialized (${CURRENT_APP_ENTRY_PARAMS})! Cancelling app launch...`)
          return false
        }
        console.info(log.name, "found app pointer")
        const {appShell} = appEntryPtr
        const appEntry = await (async (url: string) => {
          try {
            // this is a dynamic import, NOT code splitting
            const ext = await import(
              /* @vite-ignore */ window.location.href + url
            )
            if (!ext) {
              return null
            }
            return ext as AppExtensionModule
          } catch {
            return null
          }
        })(appShell.url)
        if (!appEntry) {
          console.error(log.name, `app shell entry was not found (${appShell.url}). Canceling...`)
          return false
        }
        console.info(log.name, "found app shell entry")
        // unmount launcher app
        // unmounting taken from here
        // https://stackoverflow.com/questions/72187310/how-remove-or-unmount-react-app-from-a-website-properly
        //launcherRoot.unmount()
        // destroy all created dom nodes
        //while (root.firstChild) {
        //  root.removeChild(root.firstChild)
        //}
        const {pkg} = appEntry
        console.info(log.name, "successfully unmounted launcher. Mounting app shell...")
        pkg.onInit(root)
        console.info(log.name, "successfully mounted app-shell")
        return true
      }}
    />
  </React.StrictMode>
)
