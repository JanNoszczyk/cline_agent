#!/usr/bin/env node

const { chromium } = require("playwright")

const targetUrl = "http://localhost:3000/" // Hardcoded URL

const RETRY_DELAY_MS = 15000 // Wait 15 seconds before retrying connection
const CHECK_INTERVAL_MS = 60000 // Check connection status every 60 seconds

// --- START LOG BUFFERING ---
const LOG_BUFFER = []
const originalConsoleLog = console.log
const originalConsoleError = console.error

function logToBuffer(level, component, ...args) {
	const timestamp = new Date().toISOString()
	const messageParts = args.map((arg) => {
		if (typeof arg === "object" && arg !== null) {
			try {
				// Attempt to stringify, but handle circular references or other errors
				return JSON.stringify(arg, (key, value) => {
					if (value instanceof Error) {
						return { message: value.message, stack: value.stack, name: value.name }
					}
					return value
				})
			} catch (e) {
				return "[Unserializable Object]"
			}
		}
		return String(arg)
	})
	const message = messageParts.join(" ")
	const logEntry = `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}`
	LOG_BUFFER.push(logEntry)

	if (level.toUpperCase() === "ERROR" || level.toUpperCase() === "WARN") {
		// Also print warnings immediately
		originalConsoleError(logEntry) // Use originalConsoleError for immediate stderr output
	}
}
// --- END LOG BUFFERING ---

async function keepConnectionAlive() {
	let browser = null
	let page = null
	let initialUiSetupComplete = false // Flag to track if initial UI setup has been done
	logToBuffer("info", "Activation Keeper", `Starting continuous activation for ${targetUrl}...`)

	while (true) {
		// Loop indefinitely
		try {
			if (!browser || !browser.isConnected()) {
				if (browser) {
					logToBuffer("info", "Activation Keeper", "Browser disconnected, attempting to close gracefully...")
					try {
						await browser.close()
					} catch (e) {
						logToBuffer("error", "Activation Keeper", "Error closing disconnected browser:", e.message)
					}
				}
				logToBuffer("info", "Activation Keeper", "Launching headless browser...")
				browser = await chromium.launch({
					headless: true,
					args: [
						"--no-sandbox",
						"--disable-setuid-sandbox",
						"--disable-dev-shm-usage",
						"--disable-accelerated-2d-canvas",
						"--no-first-run",
						"--no-zygote",
						"--disable-gpu",
					],
				})
				logToBuffer("info", "Activation Keeper", "Browser launched.")
				initialUiSetupComplete = false // Reset flag for new browser session

				browser.on("disconnected", () => {
					logToBuffer("error", "Activation Keeper", "Browser disconnected unexpectedly!")
					browser = null // Ensure we relaunch on next loop iteration
					page = null
				})
			}

			if (!page || page.isClosed()) {
				const context = await browser.newContext({
					ignoreHTTPSErrors: true,
					viewport: { width: 1280, height: 720 }, // Keep viewport reasonable
				})
				page = await context.newPage()

				// Capture console messages from the browser
				page.on("console", (msg) => {
					const type = msg.type() // e.g., 'log', 'error', 'warning'
					const text = msg.text()
					const location = msg.location()
					const formattedLocation = location
						? `(at ${location.url}:${location.lineNumber}:${location.columnNumber || ""})`
						: ""
					logToBuffer(type, "Browser Console", `${text} ${formattedLocation}`)
				})
				// Capture page errors
				page.on("pageerror", (exception) => {
					logToBuffer("error", "Browser Page Error", `Uncaught exception: "${exception}"`, exception)
				})

				logToBuffer("info", "Activation Keeper", `Navigating to ${targetUrl}...`)
				// Use 'load' state which waits for the load event - might be more robust
				await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 }) // Increased timeout for page.goto
				logToBuffer("info", "Activation Keeper", `Connected to ${targetUrl}.`)

				if (!initialUiSetupComplete) {
					logToBuffer("info", "Activation Keeper", "Performing initial UI setup...")
					logToBuffer("info", "Activation Keeper", "Waiting 20 seconds for initial UI stabilization...")
					await new Promise((resolve) => setTimeout(resolve, 20000)) // 20-second delay

					// Optional: Check for status bar once after connection
					try {
						logToBuffer("info", "Activation Keeper", "Waiting for status bar...")
						await page.waitForSelector(".statusbar", { timeout: 60000 }) // Increased timeout for status bar
						logToBuffer("info", "Activation Keeper", "Status bar detected.")
					} catch (e) {
						logToBuffer(
							"warn",
							"Activation Keeper",
							`Status bar not detected after connection: ${e.message}. Dumping page content for debugging:`,
						)
						try {
							const content = await page.content()
							logToBuffer("info", "Activation Keeper", "Page content (first 5KB):", content.substring(0, 5000))
						} catch (contentError) {
							logToBuffer("error", "Activation Keeper", `Error dumping page content: ${contentError.message}`)
						}
						// Continue, but this is a bad sign
					}

					// Attempt to handle Workspace Trust dialog first
					try {
						logToBuffer("info", "Activation Keeper", "Checking for Workspace Trust dialog...")
						const dialogLocator = page.locator("div.monaco-dialog-modal-block") // Locate the dialog container
						// Wait for the dialog container itself to be visible
						await dialogLocator.waitFor({ timeout: 10000, state: "visible" })
						logToBuffer("info", "Activation Keeper", "Workspace Trust dialog container detected.")

						// Locate the specific button *within the visible dialog* using getByRole
						const trustButton = dialogLocator.getByRole("button", { name: "Yes, I trust the authors", exact: true }) // Added exact: true
						logToBuffer(
							"info",
							"Activation Keeper",
							`trustButton locator created. Type of trustButton.waitFor: ${typeof trustButton.waitFor}, Type of trustButton.click: ${typeof trustButton.click}`,
						)

						// Add a specific wait for the button to be attached to the DOM first
						logToBuffer("info", "Activation Keeper", "Waiting for 'Yes, I trust the authors' button to be ATTACHED.")
						await trustButton.waitFor({ state: "attached", timeout: 7000 })

						// Then wait for the button to be visible
						logToBuffer(
							"info",
							"Activation Keeper",
							"'Yes, I trust the authors' button is ATTACHED. Waiting for it to be VISIBLE.",
						)
						await trustButton.waitFor({ state: "visible", timeout: 7000 })

						logToBuffer(
							"info",
							"Activation Keeper",
							"'Yes, I trust the authors' button is VISIBLE. Attempting click.",
						)
						await trustButton.click()
						logToBuffer(
							"info",
							"Activation Keeper",
							'Clicked "Yes, I trust the authors" button. Waiting 5s for dialog to close and UI to settle...',
						)
						await new Promise((resolve) => setTimeout(resolve, 5000))
						logToBuffer("info", "Activation Keeper", "UI settled.")
					} catch (trustError) {
						// If the dialog doesn't appear or button not found, it's fine, just log and continue
						logToBuffer(
							"info",
							"Activation Keeper",
							`Workspace Trust dialog not found or no action taken: ${trustError.message}`,
						)
					}

					// Screenshot before attempting command palette, to capture potential auth prompts
					try {
						logToBuffer("info", "Activation Keeper", "Waiting 2 seconds before taking auth prompt screenshot...")
						await new Promise((resolve) => setTimeout(resolve, 2000)) // Short delay
						logToBuffer("info", "Activation Keeper", "Taking screenshot (auth_prompt_screenshot.png)...")
						await page.screenshot({ path: "/app/logs/auth_prompt_screenshot.png", fullPage: true })
						logToBuffer("info", "Activation Keeper", "Screenshot saved to /app/logs/auth_prompt_screenshot.png")
					} catch (screenshotError) {
						logToBuffer(
							"error",
							"Activation Keeper",
							`Error taking auth_prompt_screenshot: ${screenshotError.message}`,
						)
					}

					// Attempt a more robust interaction to ensure VSCode is responsive and potentially trigger activation
					try {
						logToBuffer(
							"info",
							"Activation Keeper",
							"Attempting to open command palette and run a generic command...",
						)
						await page.keyboard.press("F1") // Open command palette
						logToBuffer("info", "Activation Keeper", "Pressed F1. Waiting a moment for palette to render...")
						await new Promise((resolve) => setTimeout(resolve, 2000)) // 2-second delay for palette to appear

						logToBuffer("info", "Activation Keeper", "Waiting for command palette input (timeout 30s)...")
						const commandPaletteInputSelector = "div.quick-input-widget input.input" // More specific selector
						await page.waitForSelector(commandPaletteInputSelector, { visible: true, timeout: 30000 })
						logToBuffer("info", "Activation Keeper", "Command palette input detected.")
						await page.keyboard.type("Preferences: Open User Settings")
						logToBuffer("info", "Activation Keeper", "Typed 'Preferences: Open User Settings'.")
						await page.keyboard.press("Enter")
						logToBuffer("info", "Activation Keeper", "Pressed Enter to open settings.")
						const settingsEditorSelector = "div.settings-editor"
						await page.waitForSelector(settingsEditorSelector, { visible: true, timeout: 30000 })
						logToBuffer("info", "Activation Keeper", "Settings editor detected. VSCode seems responsive.")
					} catch (e) {
						logToBuffer("warn", "Activation Keeper", `Could not perform command palette interaction: ${e.message}.`)
						try {
							await page.screenshot({ path: "/app/logs/command_palette_failure.png" })
							logToBuffer("info", "Activation Keeper", "Screenshot saved to /app/logs/command_palette_failure.png")
							const content = await page.content()
							logToBuffer(
								"info",
								"Activation Keeper",
								"Dumping page content (first 5KB):",
								content.substring(0, 5000),
							)
						} catch (dumpError) {
							logToBuffer("error", "Activation Keeper", `Error during failure dump: ${dumpError.message}`)
						}

						// Fallback interaction: Try clicking the Explorer icon
						logToBuffer(
							"info",
							"Activation Keeper",
							"Command palette failed. Attempting fallback: click Explorer icon.",
						)
						try {
							const explorerIconSelector = "a.action-label.codicon.codicon-explorer-view-icon" // Common selector for Explorer
							await page.waitForSelector(explorerIconSelector, { visible: true, timeout: 10000 })
							await page.click(explorerIconSelector)
							logToBuffer("info", "Activation Keeper", "Clicked Explorer icon. Waiting 5s for any effect.")
							await new Promise((resolve) => setTimeout(resolve, 5000))
							logToBuffer("info", "Activation Keeper", "Fallback interaction complete.")
						} catch (fallbackError) {
							logToBuffer(
								"warn",
								"Activation Keeper",
								`Fallback interaction (click Explorer) also failed: ${fallbackError.message}.`,
							)
							try {
								await page.screenshot({ path: "/app/logs/fallback_explorer_click_failure.png" })
								logToBuffer(
									"info",
									"Activation Keeper",
									"Screenshot saved to /app/logs/fallback_explorer_click_failure.png",
								)
							} catch (screenshotError) {
								logToBuffer(
									"error",
									"Activation Keeper",
									`Error taking fallback screenshot: ${screenshotError.message}`,
								)
							}
						}
					}

					// Open Cline sidebar before marking setup as complete
					try {
						logToBuffer("info", "Activation Keeper", "Opening Cline sidebar...")

						// Method 1: Try clicking on the Cline activity bar icon
						try {
							const clineIcon = await pageInstanceForShutdown.$(
								'div.composite-bar > div.monaco-action-bar > ul > li[aria-label*="Cline"]',
							)
							if (clineIcon) {
								await clineIcon.click()
								logToBuffer("info", "Activation Keeper", "Clicked Cline activity bar icon")
								await new Promise((resolve) => setTimeout(resolve, 2000))
							} else {
								logToBuffer("warn", "Activation Keeper", "Cline activity bar icon not found")
							}
						} catch (e) {
							logToBuffer("warn", "Activation Keeper", `Failed to click Cline icon: ${e.message}`)
						}

						// Method 2: Try using command palette
						try {
							// Open command palette
							await pageInstanceForShutdown.keyboard.down("Control")
							await pageInstanceForShutdown.keyboard.down("Shift")
							await pageInstanceForShutdown.keyboard.press("P")
							await pageInstanceForShutdown.keyboard.up("Shift")
							await pageInstanceForShutdown.keyboard.up("Control")
							await new Promise((resolve) => setTimeout(resolve, 500))

							// Type command to focus Cline
							await pageInstanceForShutdown.keyboard.type("Cline: Focus")
							await new Promise((resolve) => setTimeout(resolve, 500))
							await pageInstanceForShutdown.keyboard.press("Enter")
							logToBuffer("info", "Activation Keeper", "Executed Cline: Focus command via command palette")
							await new Promise((resolve) => setTimeout(resolve, 2000))
						} catch (e) {
							logToBuffer("warn", "Activation Keeper", `Failed to open Cline via command palette: ${e.message}`)
						}
					} catch (e) {
						logToBuffer("error", "Activation Keeper", `Failed to open Cline sidebar: ${e.message}`)
					}

					initialUiSetupComplete = true
					logToBuffer("info", "Activation Keeper", "Initial UI setup marked as complete.")
				} else {
					logToBuffer(
						"info",
						"Activation Keeper",
						"Initial UI setup already complete for this browser session, skipping.",
					)
				}

				logToBuffer("info", "Activation Keeper", "Keeping connection open.")
				page.on("close", () => {
					logToBuffer("info", "Activation Keeper", "Page closed.")
					page = null // Ensure we create a new page on next loop iteration if needed
				})
				page.on("crash", () => {
					logToBuffer("error", "Activation Keeper", "Page crashed!")
					page = null
				})
				page.on("error", (error) => {
					// This is for page-level errors, distinct from page.on('pageerror')
					logToBuffer("error", "Activation Keeper", `Page error event: ${error.message}`, error)
					// Consider setting page = null here too
				})
			}

			// Keep the script running and check connection periodically
			logToBuffer("info", "Activation Keeper", "Connection active. Waiting for next check...")
			await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS))

			// Optional: Add a lightweight check here, e.g., page.title() to see if still responsive
			if (page && !page.isClosed()) {
				logToBuffer("info", "Activation Keeper", "Periodic check: Page seems responsive.")
			} else {
				logToBuffer("warn", "Activation Keeper", "Periodic check: Page is closed or missing.")
				// Loop will handle reconnection
			}
		} catch (error) {
			logToBuffer("error", "Activation Keeper", `Error in keep-alive loop: ${error.message}`, error)
			if (browser && browser.isConnected()) {
				logToBuffer("info", "Activation Keeper", "Closing browser due to error...")
				try {
					await browser.close()
				} catch (e) {
					logToBuffer("error", "Activation Keeper", "Error closing browser after error:", e.message)
				}
			}
			browser = null // Ensure relaunch
			page = null
			logToBuffer("info", "Activation Keeper", `Retrying connection in ${RETRY_DELAY_MS / 1000} seconds...`)
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
		}
	}
}

// Graceful shutdown handling
let isShuttingDown = false
// browser and page need to be accessible in this scope for shutdown
let browserInstanceForShutdown = null
let pageInstanceForShutdown = null // Though page is less critical for shutdown itself

async function shutdown() {
	if (isShuttingDown) return
	isShuttingDown = true
	const shutdownTimestamp = new Date().toISOString()
	originalConsoleLog(`[${shutdownTimestamp}] [INFO] [Activation Keeper] Initiating graceful shutdown...`)

	if (browserInstanceForShutdown && browserInstanceForShutdown.isConnected()) {
		originalConsoleLog(`[${new Date().toISOString()}] [INFO] [Activation Keeper] Closing browser instance...`)
		try {
			await browserInstanceForShutdown.close()
			originalConsoleLog(`[${new Date().toISOString()}] [INFO] [Activation Keeper] Browser instance closed successfully.`)
		} catch (e) {
			originalConsoleError(
				`[${new Date().toISOString()}] [ERROR] [Activation Keeper] Error closing browser during shutdown: ${e.message}`,
				e,
			)
		}
	} else {
		originalConsoleLog(
			`[${new Date().toISOString()}] [INFO] [Activation Keeper] Browser instance not connected or already null, skipping explicit close.`,
		)
	}

	originalConsoleLog("--- START OF BUFFERED LOGS ---")
	try {
		LOG_BUFFER.forEach((entry) => originalConsoleLog(entry))
	} catch (e) {
		originalConsoleError(
			`[${new Date().toISOString()}] [ERROR] [Activation Keeper] Error during log buffer print: ${e.message}`,
			e,
		)
	}
	originalConsoleLog("--- END OF BUFFERED LOGS ---")

	originalConsoleLog(
		`[${new Date().toISOString()}] [INFO] [Activation Keeper] Graceful shutdown process complete. Node will exit naturally.`,
	)
}

process.on("SIGINT", async () => {
	await shutdown()
	process.exit(0)
}) // Ensure exit after async shutdown
process.on("SIGTERM", async () => {
	await shutdown()
	process.exit(0)
}) // Ensure exit after async shutdown

// Modify keepConnectionAlive to update the shared browser instance
async function keepConnectionAlive() {
	// let browser = null; // Now use browserInstanceForShutdown
	// let page = null; // Now use pageInstanceForShutdown
	let initialUiSetupComplete = false
	logToBuffer("info", "Activation Keeper", `Starting continuous activation for ${targetUrl}...`)

	while (true) {
		try {
			if (!browserInstanceForShutdown || !browserInstanceForShutdown.isConnected()) {
				if (browserInstanceForShutdown) {
					logToBuffer("info", "Activation Keeper", "Browser disconnected, attempting to close gracefully...")
					try {
						await browserInstanceForShutdown.close()
					} catch (e) {
						logToBuffer("error", "Activation Keeper", "Error closing disconnected browser:", e.message)
					}
				}
				logToBuffer("info", "Activation Keeper", "Launching headless browser...")
				browserInstanceForShutdown = await chromium.launch({
					// Assign to the shared instance
					headless: true,
					args: [
						"--no-sandbox",
						"--disable-setuid-sandbox",
						"--disable-dev-shm-usage",
						"--disable-accelerated-2d-canvas",
						"--no-first-run",
						"--no-zygote",
						"--disable-gpu",
					],
				})
				logToBuffer("info", "Activation Keeper", "Browser launched.")
				initialUiSetupComplete = false

				browserInstanceForShutdown.on("disconnected", () => {
					if (!isShuttingDown) {
						// Only log as error if not part of graceful shutdown
						logToBuffer("error", "Activation Keeper", "Browser disconnected unexpectedly!")
					} else {
						logToBuffer("info", "Activation Keeper", "Browser disconnected during shutdown (expected).")
					}
					browserInstanceForShutdown = null
					pageInstanceForShutdown = null
				})
			}

			if (!pageInstanceForShutdown || pageInstanceForShutdown.isClosed()) {
				const context = await browserInstanceForShutdown.newContext({
					ignoreHTTPSErrors: true,
					viewport: { width: 1280, height: 720 },
				})
				pageInstanceForShutdown = await context.newPage()

				pageInstanceForShutdown.on("console", (msg) => {
					const type = msg.type()
					const text = msg.text()
					const location = msg.location()
					const formattedLocation = location
						? `(at ${location.url}:${location.lineNumber}:${location.columnNumber || ""})`
						: ""
					logToBuffer(type, "Browser Console", `${text} ${formattedLocation}`)
				})
				pageInstanceForShutdown.on("pageerror", (exception) => {
					logToBuffer("error", "Browser Page Error", `Uncaught exception: "${exception}"`, exception)
				})

				logToBuffer("info", "Activation Keeper", `Navigating to ${targetUrl}...`)
				await pageInstanceForShutdown.goto(targetUrl, { waitUntil: "load", timeout: 60000 })
				logToBuffer("info", "Activation Keeper", `Connected to ${targetUrl}.`)

				if (!initialUiSetupComplete) {
					logToBuffer("info", "Activation Keeper", "Performing initial UI setup...")
					logToBuffer("info", "Activation Keeper", "Waiting 20 seconds for initial UI stabilization...")
					await new Promise((resolve) => setTimeout(resolve, 20000))

					try {
						logToBuffer("info", "Activation Keeper", "Waiting for status bar...")
						await pageInstanceForShutdown.waitForSelector(".statusbar", { timeout: 60000 })
						logToBuffer("info", "Activation Keeper", "Status bar detected.")
					} catch (e) {
						logToBuffer(
							"warn",
							"Activation Keeper",
							`Status bar not detected after connection: ${e.message}. Dumping page content for debugging:`,
						)
						try {
							const content = await pageInstanceForShutdown.content()
							logToBuffer("info", "Activation Keeper", "Page content (first 5KB):", content.substring(0, 5000))
						} catch (contentError) {
							logToBuffer("error", "Activation Keeper", `Error dumping page content: ${contentError.message}`)
						}
					}

					try {
						logToBuffer("info", "Activation Keeper", "Checking for Workspace Trust dialog...")
						const dialogLocator = pageInstanceForShutdown.locator("div.monaco-dialog-modal-block")
						await dialogLocator.waitFor({ timeout: 10000, state: "visible" })
						logToBuffer("info", "Activation Keeper", "Workspace Trust dialog container detected.")

						const trustButton = dialogLocator.getByRole("button", { name: "Yes, I trust the authors", exact: true })
						logToBuffer(
							"info",
							"Activation Keeper",
							`trustButton locator created. Type of trustButton.waitFor: ${typeof trustButton.waitFor}, Type of trustButton.click: ${typeof trustButton.click}`,
						)

						logToBuffer("info", "Activation Keeper", "Waiting for 'Yes, I trust the authors' button to be ATTACHED.")
						await trustButton.waitFor({ state: "attached", timeout: 7000 })

						logToBuffer(
							"info",
							"Activation Keeper",
							"'Yes, I trust the authors' button is ATTACHED. Waiting for it to be VISIBLE.",
						)
						await trustButton.waitFor({ state: "visible", timeout: 7000 })

						logToBuffer(
							"info",
							"Activation Keeper",
							"'Yes, I trust the authors' button is VISIBLE. Attempting click.",
						)
						await trustButton.click()
						logToBuffer(
							"info",
							"Activation Keeper",
							'Clicked "Yes, I trust the authors" button. Waiting 5s for dialog to close and UI to settle...',
						)
						await new Promise((resolve) => setTimeout(resolve, 5000))
						logToBuffer("info", "Activation Keeper", "UI settled.")
					} catch (trustError) {
						logToBuffer(
							"info",
							"Activation Keeper",
							`Workspace Trust dialog not found or no action taken: ${trustError.message}`,
						)
					}

					try {
						logToBuffer("info", "Activation Keeper", "Waiting 2 seconds before taking auth prompt screenshot...")
						await new Promise((resolve) => setTimeout(resolve, 2000))
						logToBuffer("info", "Activation Keeper", "Taking screenshot (auth_prompt_screenshot.png)...")
						await pageInstanceForShutdown.screenshot({ path: "/app/logs/auth_prompt_screenshot.png", fullPage: true })
						logToBuffer("info", "Activation Keeper", "Screenshot saved to /app/logs/auth_prompt_screenshot.png")
					} catch (screenshotError) {
						logToBuffer(
							"error",
							"Activation Keeper",
							`Error taking auth_prompt_screenshot: ${screenshotError.message}`,
						)
					}

					try {
						logToBuffer(
							"info",
							"Activation Keeper",
							"Attempting to open command palette and run a generic command...",
						)
						await pageInstanceForShutdown.keyboard.press("F1")
						logToBuffer("info", "Activation Keeper", "Pressed F1. Waiting a moment for palette to render...")
						await new Promise((resolve) => setTimeout(resolve, 2000))

						logToBuffer("info", "Activation Keeper", "Waiting for command palette input (timeout 30s)...")
						const commandPaletteInputSelector = "div.quick-input-widget input.input"
						await pageInstanceForShutdown.waitForSelector(commandPaletteInputSelector, {
							visible: true,
							timeout: 30000,
						})
						logToBuffer("info", "Activation Keeper", "Command palette input detected.")
						await pageInstanceForShutdown.keyboard.type("Preferences: Open User Settings")
						logToBuffer("info", "Activation Keeper", "Typed 'Preferences: Open User Settings'.")
						await pageInstanceForShutdown.keyboard.press("Enter")
						logToBuffer("info", "Activation Keeper", "Pressed Enter to open settings.")
						const settingsEditorSelector = "div.settings-editor"
						await pageInstanceForShutdown.waitForSelector(settingsEditorSelector, { visible: true, timeout: 30000 })
						logToBuffer("info", "Activation Keeper", "Settings editor detected. VSCode seems responsive.")
					} catch (e) {
						logToBuffer("warn", "Activation Keeper", `Could not perform command palette interaction: ${e.message}.`)
						try {
							await pageInstanceForShutdown.screenshot({ path: "/app/logs/command_palette_failure.png" })
							logToBuffer("info", "Activation Keeper", "Screenshot saved to /app/logs/command_palette_failure.png")
							const content = await pageInstanceForShutdown.content()
							logToBuffer(
								"info",
								"Activation Keeper",
								"Dumping page content (first 5KB):",
								content.substring(0, 5000),
							)
						} catch (dumpError) {
							logToBuffer("error", "Activation Keeper", `Error during failure dump: ${dumpError.message}`)
						}

						logToBuffer(
							"info",
							"Activation Keeper",
							"Command palette failed. Attempting fallback: click Explorer icon.",
						)
						try {
							const explorerIconSelector = "a.action-label.codicon.codicon-explorer-view-icon"
							await pageInstanceForShutdown.waitForSelector(explorerIconSelector, { visible: true, timeout: 10000 })
							await pageInstanceForShutdown.click(explorerIconSelector)
							logToBuffer("info", "Activation Keeper", "Clicked Explorer icon. Waiting 5s for any effect.")
							await new Promise((resolve) => setTimeout(resolve, 5000))
							logToBuffer("info", "Activation Keeper", "Fallback interaction complete.")
						} catch (fallbackError) {
							logToBuffer(
								"warn",
								"Activation Keeper",
								`Fallback interaction (click Explorer) also failed: ${fallbackError.message}.`,
							)
							try {
								await pageInstanceForShutdown.screenshot({
									path: "/app/logs/fallback_explorer_click_failure.png",
								})
								logToBuffer(
									"info",
									"Activation Keeper",
									"Screenshot saved to /app/logs/fallback_explorer_click_failure.png",
								)
							} catch (screenshotError) {
								logToBuffer(
									"error",
									"Activation Keeper",
									`Error taking fallback screenshot: ${screenshotError.message}`,
								)
							}
						}
					}

					// Open Cline sidebar before marking setup as complete
					try {
						logToBuffer("info", "Activation Keeper", "Opening Cline sidebar...")

						// Method 1: Try clicking on the Cline activity bar icon
						try {
							const clineIcon = await pageInstanceForShutdown.$(
								'div.composite-bar > div.monaco-action-bar > ul > li[aria-label*="Cline"]',
							)
							if (clineIcon) {
								await clineIcon.click()
								logToBuffer("info", "Activation Keeper", "Clicked Cline activity bar icon")
								await new Promise((resolve) => setTimeout(resolve, 2000))
							} else {
								logToBuffer("warn", "Activation Keeper", "Cline activity bar icon not found")
							}
						} catch (e) {
							logToBuffer("warn", "Activation Keeper", `Failed to click Cline icon: ${e.message}`)
						}

						// Method 2: Try using command palette
						try {
							// Open command palette
							await pageInstanceForShutdown.keyboard.down("Control")
							await pageInstanceForShutdown.keyboard.down("Shift")
							await pageInstanceForShutdown.keyboard.press("P")
							await pageInstanceForShutdown.keyboard.up("Shift")
							await pageInstanceForShutdown.keyboard.up("Control")
							await new Promise((resolve) => setTimeout(resolve, 500))

							// Type command to focus Cline
							await pageInstanceForShutdown.keyboard.type("Cline: Focus")
							await new Promise((resolve) => setTimeout(resolve, 500))
							await pageInstanceForShutdown.keyboard.press("Enter")
							logToBuffer("info", "Activation Keeper", "Executed Cline: Focus command via command palette")
							await new Promise((resolve) => setTimeout(resolve, 2000))
						} catch (e) {
							logToBuffer("warn", "Activation Keeper", `Failed to open Cline via command palette: ${e.message}`)
						}
					} catch (e) {
						logToBuffer("error", "Activation Keeper", `Failed to open Cline sidebar: ${e.message}`)
					}

					initialUiSetupComplete = true
					logToBuffer("info", "Activation Keeper", "Initial UI setup marked as complete.")
				} else {
					logToBuffer(
						"info",
						"Activation Keeper",
						"Initial UI setup already complete for this browser session, skipping.",
					)
				}

				logToBuffer("info", "Activation Keeper", "Keeping connection open.")
				pageInstanceForShutdown.on("close", () => {
					logToBuffer("info", "Activation Keeper", "Page closed.")
					pageInstanceForShutdown = null
				})
				pageInstanceForShutdown.on("crash", () => {
					logToBuffer("error", "Activation Keeper", "Page crashed!")
					pageInstanceForShutdown = null
				})
				pageInstanceForShutdown.on("error", (error) => {
					logToBuffer("error", "Activation Keeper", `Page error event: ${error.message}`, error)
				})
			}

			logToBuffer("info", "Activation Keeper", "Connection active. Waiting for next check...")
			await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS))

			if (pageInstanceForShutdown && !pageInstanceForShutdown.isClosed()) {
				logToBuffer("info", "Activation Keeper", "Periodic check: Page seems responsive.")
			} else {
				logToBuffer("warn", "Activation Keeper", "Periodic check: Page is closed or missing.")
			}
		} catch (error) {
			logToBuffer("error", "Activation Keeper", `Error in keep-alive loop: ${error.message}`, error)
			if (browserInstanceForShutdown && browserInstanceForShutdown.isConnected()) {
				logToBuffer("info", "Activation Keeper", "Closing browser due to error...")
				try {
					await browserInstanceForShutdown.close()
				} catch (e) {
					logToBuffer("error", "Activation Keeper", "Error closing browser after error:", e.message)
				}
			}
			browserInstanceForShutdown = null
			pageInstanceForShutdown = null
			logToBuffer("info", "Activation Keeper", `Retrying connection in ${RETRY_DELAY_MS / 1000} seconds...`)
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
		}
	}
}

keepConnectionAlive()
