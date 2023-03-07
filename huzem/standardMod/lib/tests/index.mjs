// prevent form element network io
addEventListener("submit", (e) => {
    e.preventDefault()
})

// prevent routing of links away from document
// and file downloads
addEventListener("click", (e) => {
    const target = e.target || e.srcElement
    if (target.tagName === "A") {
        console.log("prevented download or link click")
        e.preventDefault()
    }
})
