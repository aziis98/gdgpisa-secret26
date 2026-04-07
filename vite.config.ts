import { defineConfig } from "vite"

export default defineConfig({
    server: {
        port: 3000,
    },
    build: {
        minify: "terser",
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true,
            },
        },
    },
})
