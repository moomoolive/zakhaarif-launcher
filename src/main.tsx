import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import type {
  OutboundMessage as ServiceWorkerMessage, 
  InboundMessage as ServiceWorkerOutBoundMessage
} from "../serviceWorkers/types"
import {shabah} from "./utils"

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

shabah.defineLauncher({
  root: document.getElementById("root") as HTMLElement,
  reactRoot: null as null | ReactDOM.Root,
  mount() {
    if (this.reactRoot) {
      return
    }
    const reactRoot = ReactDOM.createRoot(this.root)
    this.reactRoot = reactRoot
    reactRoot.render(
      <React.StrictMode>
        <App appController={shabah}/>
      </React.StrictMode>
    )
  },
  unMount() {
    // unmount launcher app
    // unmounting taken from here
    // https://stackoverflow.com/questions/72187310/how-remove-or-unmount-react-app-from-a-website-properly
    //if (!this.reactRoot) {
    //  return
    //}
    //this.reactRoot.unmount()
    // destroy all created dom nodes
    //const r = this.root
    //while (r.firstChild) {
    //  r.removeChild(r.firstChild)
    //}
    //this.reactRoot = null
  }
})

const htmlDoc = (
  "<!DOCTYPE html>\n"
  + document.documentElement.outerHTML
)


shabah.showLauncher()

shabah.cacheLaucherAssets({
  rootHtmlDoc: htmlDoc,
  cargoUrl: "cargo.json",
  useMiniCargoDiff: false,
}).then(() => {
  const msg = {action: "config:verbose_logs"} as ServiceWorkerOutBoundMessage
  navigator.serviceWorker.controller?.postMessage(msg)
}).then(() => {
  const msg = {action: "list:connected_clients"} as ServiceWorkerOutBoundMessage
  navigator.serviceWorker.controller?.postMessage(msg)
}).then(() => {
  const msg = {action: "list:consts"} as ServiceWorkerOutBoundMessage
  navigator.serviceWorker.controller?.postMessage(msg)
}).then(() => {
  const msg = {action: "list:config"} as ServiceWorkerOutBoundMessage
  navigator.serviceWorker.controller?.postMessage(msg)
})