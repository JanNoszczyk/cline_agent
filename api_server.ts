import http from "http"

const port = 3001

const server = http.createServer((req, res) => {
	// Set CORS headers
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key")

	// Handle OPTIONS request (for CORS preflight)
	if (req.method === "OPTIONS") {
		res.writeHead(204)
		res.end()
		return
	}

	// Only handle GET requests
	if (req.method !== "GET") {
		res.writeHead(405, { "Content-Type": "application/json" })
		res.end(JSON.stringify({ message: "Method not allowed" }))
		return
	}

	// Handle /api/state endpoint
	if (req.url === "/api/state") {
		const apiKey = req.headers["x-api-key"] as string

		// Check if API key is valid
		if (apiKey !== process.env.CLINE_API_KEY) {
			res.writeHead(401, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ message: "Unauthorized: Invalid or missing API key." }))
			return
		}

		// Return success response
		res.writeHead(200, { "Content-Type": "application/json" })
		res.end(JSON.stringify({ status: "ok" }))
		return
	}

	// Handle 404 for all other routes
	res.writeHead(404, { "Content-Type": "application/json" })
	res.end(JSON.stringify({ message: "Not found" }))
})

// Start the server
server.listen(port, "0.0.0.0", () => {
	console.log(`Test API server listening on port ${port}`)
})
