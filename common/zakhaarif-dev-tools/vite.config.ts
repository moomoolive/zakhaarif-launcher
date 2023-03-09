import {defineConfig} from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
    build: {
        outDir: "build",
        target: "es2020",
        minify: false,
        lib: {
            entry: [
                "./src/index.ts",
                "./src/mods.ts",
                "./src/permissions.ts",
                "./src/huzem.ts",
                "./src/extensions.ts",
            ],
            formats: ["es"]
        }
    },
    plugins: [dts()],
})