import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import {dom_hooks} from "../sharedLib/consts"
import type {
  AppEntryPointers,
} from "../sharedLib/types"
import {ServiceWorkerMessage} from "../serviceWorkers/types"
import {entryRecords} from "../sharedLib/utils"

const enum log {
  name = "[🤖 app-controller]:",
  sw = "[💾 service-worker]:"
}

if (navigator.serviceWorker) {
  const url = import.meta.env.PROD ? "dev-sw.js" : "dev-sw.js"
  navigator.serviceWorker.register(url, {scope: "/"})
  navigator.serviceWorker.addEventListener("message", (msg) => {
    const {type, contents} = msg.data as ServiceWorkerMessage
    switch (type) {
      case "info":
        console.info(log.sw, contents)
        break
      case "error":
        console.error(log.sw, contents)
        break
      default:
        console.warn(log.name, "recieved msg from service worker, but it was encoded incorrectly")
        break
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
            return await res.json() as AppEntryPointers
          } catch {
            return null
          }
        })(entryRecords())
        if (!appEntryPtr || appEntryPtr.entries.length < 1) {
          console.error(log.name, `app pointer has not been initialized (${entryRecords()})! Cancelling app launch...`)
          return false
        }
        console.info(log.name, "found app pointers")
        const appShell = appEntryPtr.entries[0]
        //const {appShell} = appEntryPtr
        const appEntry = await (async (url: string) => {
          try {
            // this is a dynamic import, NOT code splitting
            await import(/* @vite-ignore */ url)
            return {}
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
        console.info(log.name, "successfully unmounted launcher. Mounting app shell...")
        console.info(log.name, "successfully mounted app-shell")
        return true
      }}
    />
  </React.StrictMode>
)
