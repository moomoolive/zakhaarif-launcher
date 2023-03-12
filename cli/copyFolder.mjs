#!/usr/bin/env node
import fs from "fs-extra"
import commandLineArgs from "command-line-args"

const {source = "", dest = ""} = commandLineArgs([
    {name: "source", type: String},
    {name: "dest", type: String}
])

if (!source || !dest) {
    throw new Error(`source and dest option must be specified`)
}

console.info("📁 copying", source, "to", dest)

await fs.copy(source, dest)

console.info("✅ copied successfully!")