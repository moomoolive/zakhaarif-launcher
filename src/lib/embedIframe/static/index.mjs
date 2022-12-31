const main = () => {
    console.log("hello from embed script")
    const [_, query] = location.href.split("?")
    //const url = decodeURIComponent(query.slice(4))
    const root = document.getElementById("root")
    if (!root) {
        return
    }
    root.innerHTML = `<iframe
        id="sub-process"
        name="sub-process"
        src="http://localhost:5173/?mode=game&sandbox=std"
        sandbox="allow-orientation-lock allow-pointer-lock allow-scripts allow-same-origin"
        style="width: 100vw; height: 100vh; z-index: 10; position: fixed;"
    ></iframe>`.trim()
}

main()

export {}