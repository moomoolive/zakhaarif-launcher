import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const rootElement = document.getElementById("root") as HTMLElement
const reactRoot = ReactDOM.createRoot(rootElement)

reactRoot.render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>
)
