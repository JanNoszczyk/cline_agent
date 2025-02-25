import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		port: 3000,
	},
	build: {
		outDir: "dist",
		sourcemap: true,
	},
	resolve: {
		alias: {
			// Allow importing from the shared directory
			"../../../src/shared": path.resolve(__dirname, "../src/shared"),
		},
	},
})
