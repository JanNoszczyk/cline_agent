/**
 * Script to create a chess game using the Anthropic API
 * This script is used by the end-to-end chess game creation tests
 * but can also be run directly to generate a chess game script
 */

const fs = require("fs")
const https = require("https")

// Configuration
const CLAUDE_API_KEY =
	process.env.CLAUDE_API_KEY ||
	"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"
const MODEL = process.env.MODEL || "claude-3-7-sonnet-20240307"
const OUTPUT_FILE = process.env.OUTPUT_FILE || "chess_game.sh"

// Create a prompt for Claude to create a simple chess game
const prompt =
	"Create a simple chess game in bash that: " +
	"1. Displays a chess board in the terminal " +
	"2. Allows two players to make moves " +
	"3. Validates moves according to chess rules " +
	"4. Detects check and checkmate " +
	"5. Provides a simple interface for gameplay " +
	"Return only the bash script without any explanation."

// Function to call the Anthropic API
function callAnthropicAPI() {
	return new Promise((resolve, reject) => {
		const data = JSON.stringify({
			model: MODEL,
			max_tokens: 4000,
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
		})

		const options = {
			hostname: "api.anthropic.com",
			path: "/v1/messages",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": CLAUDE_API_KEY,
				"anthropic-version": "2023-06-01",
				"Content-Length": data.length,
			},
		}

		const req = https.request(options, (res) => {
			let responseData = ""

			res.on("data", (chunk) => {
				responseData += chunk
			})

			res.on("end", () => {
				if (res.statusCode === 200) {
					try {
						const parsedData = JSON.parse(responseData)
						resolve(parsedData)
					} catch (error) {
						reject(new Error(`Failed to parse response: ${error.message}`))
					}
				} else {
					reject(new Error(`API request failed with status code ${res.statusCode}: ${responseData}`))
				}
			})
		})

		req.on("error", (error) => {
			reject(new Error(`API request error: ${error.message}`))
		})

		req.write(data)
		req.end()
	})
}

// Main function
async function main() {
	console.log("Creating chess game script using Anthropic API...")

	try {
		const response = await callAnthropicAPI()

		if (!response.content || response.content.length === 0) {
			throw new Error("No content in Anthropic API response")
		}

		// Extract the script from the response
		const script = response.content[0].text

		if (!script || script.length === 0) {
			throw new Error("No script in Anthropic API response")
		}

		// Save the script to a file
		fs.writeFileSync(OUTPUT_FILE, script)
		fs.chmodSync(OUTPUT_FILE, "755") // Make executable

		console.log(`Chess game script saved to ${OUTPUT_FILE}`)
		console.log(`You can run it with: ./${OUTPUT_FILE}`)
	} catch (error) {
		console.error(`Error: ${error.message}`)
		process.exit(1)
	}
}

// Run the main function
main()
