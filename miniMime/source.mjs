// @ts-check
import _sources from "./source.json" assert {type: "json"} 

/** @type {Array<{ext: string[], mime: string}>} */
const sources = _sources

/** @type {string[]} */
const strs = []
for (const {ext, mime} of sources) {
    const cases = ext.reduce((t, e) => {
        return t + `\tcase "${e.replace(".", "")}":\n`
    }, "")
    const val = `\t\treturn "${mime}"`
    strs.push(cases + val)
}

let output = `
export const extensionToMime = (extension: string) => {
    switch (extension) {\n${strs
            .reduce((t, s) => t + s + "\n", "")
        }\tdefault:
            return "text/plain"
    }
}
`.trim()

console.log(output)
