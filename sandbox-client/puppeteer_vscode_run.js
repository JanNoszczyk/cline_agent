#!/usr/bin/env node

const { chromium } = require("playwright")

const targetUrl = "http://localhost:3000/" // Hardcoded URL

const RETRY_DELAY_MS = 15000 // Wait 15 seconds before retrying connection
const CHECK_INTERVAL_MS = 60000 // Check connection status every 60 seconds

async function keepConnectionAlive() {
	let browser = null
	let page = null
	console.log(`[Activation Keeper] Starting continuous activation for ${targetUrl}...`)

	while (true) {
		// Loop indefinitely
		try {
			if (!browser || !browser.isConnected()) {
				if (browser) {
					console.log("[Activation Keeper] Browser disconnected, attempting to close gracefully...")
					try {
						await browser.close()
					} catch (e) {
						console.error("[Activation Keeper] Error closing disconnected browser:", e.message)
					}
				}
				console.log("[Activation Keeper] Launching headless browser...")
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
				console.log("[Activation Keeper] Browser launched.")

				browser.on("disconnected", () => {
					console.error("[Activation Keeper] Browser disconnected unexpectedly!")
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
					const type = msg.type()
					const text = msg.text()
					const location = msg.location()
					console.log(
						`[BROWSER CONSOLE] [${type.toUpperCase()}] ${text} (at ${location.url}:${location.lineNumber}:${location.columnNumber || ""})`,
					)
				})
				// Capture page errors
				page.on("pageerror", (exception) => {
					console.log(`[BROWSER PAGE ERROR] Uncaught exception: "${exception}"`)
				})

				console.log(`[${new Date().toISOString()}] [Activation Keeper] Navigating to ${targetUrl}...`)
				// Use 'load' state which waits for the load event - might be more robust
				await page.goto(targetUrl, { waitUntil: "load", timeout: 60000 }) // Increased timeout for page.goto
				console.log(`[${new Date().toISOString()}] [Activation Keeper] Connected to ${targetUrl}.`)

				console.log(
					`[${new Date().toISOString()}] [Activation Keeper] Waiting 20 seconds for initial UI stabilization...`,
				)
				await new Promise((resolve) => setTimeout(resolve, 20000)) // 20-second delay

				// Optional: Check for status bar once after connection
				try {
					console.log(`[${new Date().toISOString()}] [Activation Keeper] Waiting for status bar...`)
					await page.waitForSelector(".statusbar", { timeout: 60000 }) // Increased timeout for status bar
					console.log(`[${new Date().toISOString()}] [Activation Keeper] Status bar detected.`)
				} catch (e) {
					console.warn(
						`[${new Date().toISOString()}] [Activation Keeper] Status bar not detected after connection: ${e.message}. Dumping page content for debugging:`,
					)
					try {
						const content = await page.content()
						console.log(content.substring(0, 5000)) // Log first 5KB of content
					} catch (contentError) {
						console.error(
							`[${new Date().toISOString()}] [Activation Keeper] Error dumping page content: ${contentError.message}`,
						)
					}
					// Continue, but this is a bad sign
				}

				// Attempt to handle Workspace Trust dialog first
				try {
					console.log(`[${new Date().toISOString()}] [Activation Keeper] Checking for Workspace Trust dialog...`)
					const dialogLocator = page.locator("div.monaco-dialog-modal-block") // Locate the dialog container
					// Wait for the dialog container itself to be visible
					await dialogLocator.waitFor({ timeout: 10000, state: "visible" })
					console.log(`[${new Date().toISOString()}] [Activation Keeper] Workspace Trust dialog container detected.`)

					// Locate the specific button *within the visible dialog* using getByRole
					const trustButton = dialogLocator.getByRole("button", { name: "Yes, I trust the authors", exact: true }) // Added exact: true
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] trustButton locator created. Type of trustButton.waitFor: ${typeof trustButton.waitFor}, Type of trustButton.click: ${typeof trustButton.click}`,
					)

					// Add a specific wait for the button to be attached to the DOM first
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Waiting for 'Yes, I trust the authors' button to be ATTACHED.`,
					)
					await trustButton.waitFor({ state: "attached", timeout: 7000 })

					// Then wait for the button to be visible
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] 'Yes, I trust the authors' button is ATTACHED. Waiting for it to be VISIBLE.`,
					)
					await trustButton.waitFor({ state: "visible", timeout: 7000 })

					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] 'Yes, I trust the authors' button is VISIBLE. Attempting click.`,
					)
					await trustButton.click()
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Clicked "Yes, I trust the authors" button. Waiting 5s for dialog to close and UI to settle...`,
					)
					await new Promise((resolve) => setTimeout(resolve, 5000))
					console.log(`[${new Date().toISOString()}] [Activation Keeper] UI settled.`)
				} catch (trustError) {
					// If the dialog doesn't appear or button not found, it's fine, just log and continue
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Workspace Trust dialog not found or no action taken: ${trustError.message}`,
					)
				}

				// Attempt a more robust interaction to ensure VSCode is responsive and potentially trigger activation
				try {
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Attempting to open command palette and run a generic command...`,
					)
					await page.keyboard.press("F1") // Open command palette
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Pressed F1. Waiting a moment for palette to render...`,
					)
					await new Promise((resolve) => setTimeout(resolve, 2000)) // 2-second delay for palette to appear

					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Waiting for command palette input (timeout 30s)...`,
					)
					const commandPaletteInputSelector = "div.quick-input-widget input.input" // More specific selector
					await page.waitForSelector(commandPaletteInputSelector, { visible: true, timeout: 30000 })
					console.log(`[${new Date().toISOString()}] [Activation Keeper] Command palette input detected.`)
					await page.keyboard.type("Preferences: Open User Settings")
					console.log(`[${new Date().toISOString()}] [Activation Keeper] Typed 'Preferences: Open User Settings'.`)
					await page.keyboard.press("Enter")
					console.log(`[${new Date().toISOString()}] [Activation Keeper] Pressed Enter to open settings.`)
					const settingsEditorSelector = "div.settings-editor"
					await page.waitForSelector(settingsEditorSelector, { visible: true, timeout: 30000 })
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Settings editor detected. VSCode seems responsive.`,
					)
				} catch (e) {
					console.warn(
						`[${new Date().toISOString()}] [Activation Keeper] Could not perform command palette interaction: ${e.message}.`,
					)
					try {
						await page.screenshot({ path: "/app/logs/command_palette_failure.png" })
						console.log(
							`[${new Date().toISOString()}] [Activation Keeper] Screenshot saved to /app/logs/command_palette_failure.png`,
						)
						const content = await page.content()
						console.log(`[${new Date().toISOString()}] [Activation Keeper] Dumping page content (first 5KB):`)
						console.log(content.substring(0, 5000))
					} catch (dumpError) {
						console.error(
							`[${new Date().toISOString()}] [Activation Keeper] Error during failure dump: ${dumpError.message}`,
						)
					}

					// Fallback interaction: Try clicking the Explorer icon
					console.log(
						`[${new Date().toISOString()}] [Activation Keeper] Command palette failed. Attempting fallback: click Explorer icon.`,
					)
					try {
						const explorerIconSelector = "a.action-label.codicon.codicon-explorer-view-icon" // Common selector for Explorer
						await page.waitForSelector(explorerIconSelector, { visible: true, timeout: 10000 })
						await page.click(explorerIconSelector)
						console.log(
							`[${new Date().toISOString()}] [Activation Keeper] Clicked Explorer icon. Waiting 5s for any effect.`,
						)
						await new Promise((resolve) => setTimeout(resolve, 5000))
						console.log(`[${new Date().toISOString()}] [Activation Keeper] Fallback interaction complete.`)
					} catch (fallbackError) {
						console.warn(
							`[${new Date().toISOString()}] [Activation Keeper] Fallback interaction (click Explorer) also failed: ${fallbackError.message}.`,
						)
						try {
							await page.screenshot({ path: "/app/logs/fallback_explorer_click_failure.png" })
							console.log(
								`[${new Date().toISOString()}] [Activation Keeper] Screenshot saved to /app/logs/fallback_explorer_click_failure.png`,
							)
						} catch (screenshotError) {
							console.error(
								`[${new Date().toISOString()}] [Activation Keeper] Error taking fallback screenshot: ${screenshotError.message}`,
							)
						}
					}
				}

				console.log(`[${new Date().toISOString()}] [Activation Keeper] Keeping connection open.`)
				page.on("close", () => {
					console.log("[Activation Keeper] Page closed.")
					page = null // Ensure we create a new page on next loop iteration if needed
				})
				page.on("crash", () => {
					console.error("[Activation Keeper] Page crashed!")
					page = null
				})
				page.on("error", (error) => {
					console.error(`[Activation Keeper] Page error: ${error.message}`)
					// Consider setting page = null here too
				})
			}

			// Keep the script running and check connection periodically
			console.log("[Activation Keeper] Connection active. Waiting for next check...")
			await new Promise((resolve) => setTimeout(resolve, CHECK_INTERVAL_MS))

			// Optional: Add a lightweight check here, e.g., page.title() to see if still responsive
			if (page && !page.isClosed()) {
				console.log("[Activation Keeper] Periodic check: Page seems responsive.")
			} else {
				console.warn("[Activation Keeper] Periodic check: Page is closed or missing.")
				// Loop will handle reconnection
			}
		} catch (error) {
			console.error(`[Activation Keeper] Error in keep-alive loop: ${error.message}`)
			if (browser && browser.isConnected()) {
				console.log("[Activation Keeper] Closing browser due to error...")
				try {
					await browser.close()
				} catch (e) {
					console.error("[Activation Keeper] Error closing browser after error:", e.message)
				}
			}
			browser = null // Ensure relaunch
			page = null
			console.log(`[Activation Keeper] Retrying connection in ${RETRY_DELAY_MS / 1000} seconds...`)
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
		}
	}
}

// Graceful shutdown handling
let isShuttingDown = false
async function shutdown() {
	if (isShuttingDown) return
	isShuttingDown = true
	console.log("[Activation Keeper] Initiating graceful shutdown...")
	// Add browser closing logic here if needed and if browser instance is accessible
	// This might be tricky depending on scope, the loop's error handling might be sufficient
	console.log("[Activation Keeper] Exiting.")
	process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

keepConnectionAlive()
