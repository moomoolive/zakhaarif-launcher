import {parseArgs} from "node:util"
import fs from "fs-extra"

(async () => {
    const {values: {source = "", dest = ""}} = parseArgs({
        options: {
            source: {type: "string"},
            dest: {type: "string"}
        }
    })

    if (!source || !dest) {
        console.error(`source and dest option must be specified`)
        return
    }
    
    console.log("copying", source, "to", dest)
    
    await fs.copy(source, dest)
})()