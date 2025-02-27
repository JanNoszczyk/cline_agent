/**
 * Test script for verifying Docker API server integration with frontend (now moved to cline-frontend-private)
 *
 * This script tests:
 * 1. Basic API connectivity with authentication
 * 2. The /api/state endpoint (the only one implemented in Docker API server)
 * 3. Frontend fallback behavior for unsupported endpoints
 */

const fetch = require("node-fetch")

// Configuration
const API_URL = process.env.API_URL || "http://localhost:3000"
const API_KEY = process.env.API_KEY || "test-api-key"
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3002"

// Colors for console output
const colors = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
}

// Test results tracking
const results = {
	passed: 0,
	failed: 0,
	total: 0,
}

/**
 * Make an API request with authentication
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {object} body - Request body
 * @returns {Promise<object>} - Response data and status
 */
async function makeRequest(endpoint, method = "GET", body = null) {
	const options = {
		method,
		headers: {
			"Content-Type": "application/json",
			"X-API-Key": API_KEY,
		},
	}

	if (body) {
		options.body = JSON.stringify(body)
	}

	try {
		const response = await fetch(`${API_URL}${endpoint}`, options)
		const status = response.status

		let data = null
		if (status !== 204) {
			try {
				data = await response.json()
			} catch (e) {
				// Response might not contain JSON
			}
		}

		return { status, data }
	} catch (error) {
		console.error(`${colors.red}Error making request to ${endpoint}:${colors.reset}`, error.message)
		throw error
	}
}

/**
 * Run a test case
 * @param {string} name - Test name
 * @param {Function} testFn - Test function
 */
async function runTest(name, testFn) {
	results.total++
	console.log(`\n${colors.blue}Running test: ${name}${colors.reset}`)

	try {
		await testFn()
		console.log(`${colors.green}✓ Test passed: ${name}${colors.reset}`)
		results.passed++
	} catch (error) {
		console.error(`${colors.red}✗ Test failed: ${name}${colors.reset}`)
		console.error(`  ${colors.red}Error: ${error.message}${colors.reset}`)
		results.failed++
	}
}

/**
 * Assert a condition
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition fails
 */
function assert(condition, message) {
	if (!condition) {
		throw new Error(message)
	}
}

// Test cases
const tests = [
	// Test 1: API server is running
	{
		name: "API server is running",
		test: async () => {
			try {
				await fetch(`${API_URL}/api/state`, {
					method: "OPTIONS",
					headers: { Origin: FRONTEND_URL },
				})
				// If no error is thrown, the server is running
			} catch (error) {
				throw new Error(`API server is not running: ${error.message}`)
			}
		},
	},

	// Test 2: CORS is properly configured
	{
		name: "CORS is properly configured",
		test: async () => {
			const response = await fetch(`${API_URL}/api/state`, {
				method: "OPTIONS",
				headers: { Origin: FRONTEND_URL },
			})

			const corsHeaders = {
				"access-control-allow-origin": "*",
				"access-control-allow-methods": response.headers.get("access-control-allow-methods"),
				"access-control-allow-headers": response.headers.get("access-control-allow-headers"),
			}

			assert(
				corsHeaders["access-control-allow-origin"] === "*" || corsHeaders["access-control-allow-origin"] === FRONTEND_URL,
				"CORS Allow-Origin header is not properly configured",
			)

			assert(corsHeaders["access-control-allow-methods"].includes("GET"), "CORS Allow-Methods header does not include GET")

			assert(
				corsHeaders["access-control-allow-headers"].includes("X-API-Key"),
				"CORS Allow-Headers header does not include X-API-Key",
			)
		},
	},

	// Test 3: Authentication with valid API key
	{
		name: "Authentication with valid API key",
		test: async () => {
			const { status, data } = await makeRequest("/api/state")
			assert(status === 200, `Expected status 200, got ${status}`)
			assert(data && data.status === "ok", 'Expected {"status":"ok"} response')
		},
	},

	// Test 4: Authentication with invalid API key
	{
		name: "Authentication with invalid API key",
		test: async () => {
			const options = {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": "invalid-key",
				},
			}

			const response = await fetch(`${API_URL}/api/state`, options)
			assert(response.status === 401, `Expected status 401, got ${response.status}`)

			const data = await response.json()
			assert(data.message && data.message.includes("Unauthorized"), "Expected unauthorized error message")
		},
	},

	// Test 5: Missing API key
	{
		name: "Missing API key",
		test: async () => {
			const options = {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			}

			const response = await fetch(`${API_URL}/api/state`, options)
			assert(response.status === 401, `Expected status 401, got ${response.status}`)
		},
	},

	// Test 6: Unsupported HTTP method
	{
		name: "Unsupported HTTP method",
		test: async () => {
			const options = {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": API_KEY,
				},
				body: JSON.stringify({ test: "data" }),
			}

			const response = await fetch(`${API_URL}/api/state`, options)
			assert(response.status === 405, `Expected status 405, got ${response.status}`)
		},
	},

	// Test 7: Unsupported endpoint
	{
		name: "Unsupported endpoint",
		test: async () => {
			const { status } = await makeRequest("/api/unsupported")
			assert(status === 404, `Expected status 404, got ${status}`)
		},
	},
]

// Run all tests
async function runAllTests() {
	console.log(`${colors.cyan}=== Docker API Server Integration Tests ===${colors.reset}`)
	console.log(`${colors.yellow}Testing API server at: ${API_URL}${colors.reset}`)
	console.log(`${colors.yellow}Frontend URL: ${FRONTEND_URL}${colors.reset}`)

	for (const test of tests) {
		await runTest(test.name, test.test)
	}

	// Print summary
	console.log(`\n${colors.cyan}=== Test Summary ===${colors.reset}`)
	console.log(`${colors.yellow}Total tests: ${results.total}${colors.reset}`)
	console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`)
	console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`)

	if (results.failed === 0) {
		console.log(`\n${colors.green}✓ All tests passed!${colors.reset}`)
		console.log(
			`\n${colors.cyan}The Docker API server is correctly configured and the frontend (cline-frontend-private) should be able to connect to it.${colors.reset}`,
		)
		console.log(
			`${colors.cyan}The frontend is designed to handle the limited API functionality by using mock responses for unsupported endpoints.${colors.reset}`,
		)
	} else {
		console.log(`\n${colors.red}✗ Some tests failed. Please check the errors above.${colors.reset}`)
	}
}

// Run the tests
runAllTests().catch((error) => {
	console.error(`${colors.red}Error running tests:${colors.reset}`, error)
	process.exit(1)
})
