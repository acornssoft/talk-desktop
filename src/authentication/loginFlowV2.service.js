/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { app, net, shell } = require('electron')
const os = require('node:os')
const { osTitle } = require('../app/system.utils.ts')
const { BUILD_CONFIG } = require('../shared/build.config.ts')

/** @type {number} Polling interval in milliseconds */
const POLL_INTERVAL_MS = 2000
/** @type {number} Timeout in milliseconds (20 minutes, matching server token expiry) */
const TIMEOUT_MS = 20 * 60 * 1000

/**
 * @typedef {object} LoginFlowV2Session
 * @property {string} loginUrl - URL to open in the browser
 * @property {() => void} cancel - Cancel the polling
 * @property {Promise<import('./login.service.js').Credentials|Error>} result - Resolves with credentials or Error
 */

/** @type {AbortController|null} */
let activeController = null

/** @type {LoginFlowV2Session|null} */
let activeSession = null

/**
 * Get the currently active Login Flow v2 session
 *
 * @return {LoginFlowV2Session|null}
 */
function getActiveSession() {
	return activeSession
}

/**
 * Build User-Agent string matching the existing login window format
 *
 * @return {string}
 */
function buildUserAgent() {
	return `${os.hostname()} (${BUILD_CONFIG.applicationName} - ${osTitle})`
}

/**
 * Start Login Flow v2
 *
 * @param {string} serverUrl - Nextcloud server URL (without trailing slash)
 * @return {Promise<LoginFlowV2Session>} Session object with loginUrl, cancel, and result promise
 */
async function startLoginFlowV2(serverUrl) {
	// Abort any previously active flow
	if (activeController) {
		activeController.abort()
		activeController = null
	}

	const controller = new AbortController()
	activeController = controller

	const userAgent = buildUserAgent()

	// Step 1: Initiate Login Flow v2
	const initResponse = await net.fetch(`${serverUrl}/index.php/login/v2`, {
		method: 'POST',
		headers: {
			'User-Agent': userAgent,
			'Accept-Language': app.getPreferredSystemLanguages().join(','),
		},
		signal: controller.signal,
	})

	if (!initResponse.ok) {
		activeController = null
		throw new Error(`Login Flow v2 init failed: ${initResponse.status}`)
	}

	const initData = await initResponse.json()
	const { poll, login: loginUrl } = initData

	// Step 2: Open login URL in the default browser
	await shell.openExternal(loginUrl)

	// Step 3: Start polling
	const result = new Promise((resolve) => {
		let timeoutId
		let pollId

		/**
		 * Clean up timers and active state
		 */
		function cleanup() {
			if (timeoutId) {
				clearTimeout(timeoutId)
				timeoutId = null
			}
			if (pollId) {
				clearTimeout(pollId)
				pollId = null
			}
			if (activeController === controller) {
				activeController = null
			}
			activeSession = null
		}

		// Listen for abort (cancel)
		controller.signal.addEventListener('abort', () => {
			// Only resolve if not already resolved by timeout
			if (timeoutId !== null) {
				cleanup()
				resolve(new Error('Login was cancelled'))
			}
		})

		// Timeout after 20 minutes
		timeoutId = setTimeout(() => {
			timeoutId = null
			cleanup()
			resolve(new Error('Login timed out. Please try again.'))
			controller.abort()
		}, TIMEOUT_MS)

		/**
		 * Execute a single poll request
		 */
		async function doPoll() {
			if (controller.signal.aborted) {
				return
			}

			try {
				const response = await net.fetch(poll.endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'User-Agent': userAgent,
					},
					body: `token=${encodeURIComponent(poll.token)}`,
					signal: controller.signal,
				})

				if (response.ok) {
					// Success - user approved the login
					const data = await response.json()
					cleanup()
					resolve({
						server: data.server,
						user: data.loginName,
						password: data.appPassword,
					})
					return
				}

				if (response.status === 404) {
					// Not yet approved - schedule next poll
					pollId = setTimeout(doPoll, POLL_INTERVAL_MS)
					return
				}

				// Unexpected status
				cleanup()
				resolve(new Error(`Unexpected server response: ${response.status}`))
			} catch {
				if (controller.signal.aborted) {
					// Already handled by abort listener
					return
				}
				cleanup()
				resolve(new Error('Network error during login'))
			}
		}

		// Start first poll
		pollId = setTimeout(doPoll, POLL_INTERVAL_MS)
	})

	const session = {
		loginUrl,
		cancel() {
			controller.abort()
		},
		result,
	}

	activeSession = session

	return session
}

/**
 * Cancel the active Login Flow v2 session if any
 */
function cancelLoginFlowV2() {
	if (activeController) {
		activeController.abort()
		activeController = null
	}
}

/**
 * Re-open the login URL in the default browser
 *
 * @param {string} loginUrl - The login URL from the v2 flow
 * @return {Promise<void>}
 */
async function reopenLoginFlowV2(loginUrl) {
	await shell.openExternal(loginUrl)
}

module.exports = {
	startLoginFlowV2,
	cancelLoginFlowV2,
	reopenLoginFlowV2,
	getActiveSession,
}
