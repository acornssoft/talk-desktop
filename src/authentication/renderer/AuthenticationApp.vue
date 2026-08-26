<!--
  - SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script setup>
import { translate as t } from '@nextcloud/l10n'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import IconArrowRight from 'vue-material-design-icons/ArrowRight.vue'
import AppWindow from '../../shared/components/AppWindow.vue'
import { appData } from '../../app/AppData.js'
import { refetchAppData } from '../../app/appData.service.js'
import { MIN_REQUIRED_NEXTCLOUD_VERSION, MIN_REQUIRED_TALK_VERSION } from '../../constants.js'
import { parseAccountId } from '../../shared/accounts.utils.ts'
import { getAppConfigValue, setAppConfigValue } from '../../shared/appConfig.service.ts'
import { BUILD_CONFIG } from '../../shared/build.config.ts'
import { getCapabilities } from '../../shared/ocs.service.js'

const channel = __CHANNEL__
const version = __VERSION_TAG__

// Pre-fill server url with the last used one or set in the config
const prefilledServer = parseAccountId(getAppConfigValue('accounts')?.[0])?.serverUrl

const rawServerUrl = ref(BUILD_CONFIG.domain ?? prefilledServer)
const enforceDomain = Boolean(BUILD_CONFIG.domain && BUILD_CONFIG.enforceDomain)

const allowReset = computed(() => !!(rawServerUrl.value && !enforceDomain))

const serverUrl = computed(() => {
	const addHTTPS = (url) => url.startsWith('http') ? url : `https://${url}`
	const removeIndexPhp = (url) => url.includes('/index.php') ? url.slice(0, url.indexOf('/index.php')) : url
	const removeTrailingSlash = (url) => url.endsWith('/') ? url.slice(0, -1) : url
	return removeTrailingSlash(removeIndexPhp(addHTTPS(rawServerUrl.value))).trim()
})

/** @type {import('vue').Ref<'idle'|'loading'|'awaiting-browser'|'error'|'success'>} */
const state = ref('idle')
const stateText = ref('')

/**
 * Generation counter to detect stale login flows.
 * Incremented on cancel; checked after async operations to silently bail out
 * if the user cancelled while a flow was in progress.
 */
let loginGeneration = 0

onMounted(() => {
	if (enforceDomain) {
		login()
	}
})

onUnmounted(() => {
	// Cancel any active v2 flow when component is destroyed
	if (state.value === 'awaiting-browser') {
		window.TALK_DESKTOP.cancelLoginFlowV2()
	}
})

/**
 * Map a machine-readable Login Flow v2 error code to a localized user-facing message
 *
 * @param {string} code - Error code from the main process
 * @return {string} Localized error message
 */
function mapLoginFlowV2Error(code) {
	const messages = {
		timeout: t('talk_desktop', 'Login timed out. Please try again.'),
		network: t('talk_desktop', 'A network error occurred during login. Please try again.'),
		unexpected: t('talk_desktop', 'Unexpected server error'),
		no_session: t('talk_desktop', 'Unexpected error'),
		cancelled: t('talk_desktop', 'Login was cancelled'),
	}
	return messages[code] ?? t('talk_desktop', 'Unexpected error')
}

/**
 * Switch state to success
 */
function setSuccess() {
	state.value = 'success'
	stateText.value = t('talk_desktop', 'Logged in successfully')
}

/**
 * Switch state to loading
 */
function setLoading() {
	state.value = 'loading'
	stateText.value = ''
}

/**
 * Switch state to awaiting browser
 */
function setAwaitingBrowser() {
	state.value = 'awaiting-browser'
	stateText.value = ''
}

/**
 * Switch state to error
 *
 * @param {string} error - Error message
 */
function setError(error) {
	state.value = 'error'
	stateText.value = error
}

/**
 * Reset current server url and last used accounts
 */
function reset() {
	rawServerUrl.value = ''
	state.value = 'idle'
	stateText.value = ''
	prefilledServer = ''
	prefilledUser = ''
	setAppConfigValue('accounts', [])
}

/**
 * Cancel the active Login Flow v2 and return to idle
 */
function cancelLoginFlowV2() {
	loginGeneration++
	window.TALK_DESKTOP.cancelLoginFlowV2()
	state.value = 'idle'
	stateText.value = ''
}

/**
 * Re-open the login URL in the default browser
 */
function reopenBrowser() {
	window.TALK_DESKTOP.reopenLoginFlowV2()
}

/**
 * Try Login Flow v2, returns credentials or null if v2 is not available.
 * The try block only covers startLoginFlowV2 (init POST); await errors are
 * propagated as Error instances, not treated as v2-unavailable.
 *
 * @return {Promise<import('../../authentication/login.service.js').Credentials|Error|null>} credentials, Error, or null (v2 unavailable)
 */
async function tryLoginFlowV2() {
	try {
		await window.TALK_DESKTOP.startLoginFlowV2(serverUrl.value)
	} catch {
		// Login Flow v2 init failed - endpoint not available, fall back to v1
		return null
	}

	// v2 is available - show waiting UI
	setAwaitingBrowser()

	const result = await window.TALK_DESKTOP.awaitLoginFlowV2()
	return result
}

/**
 * Login
 */
async function login() {
	const myGeneration = ++loginGeneration
	setLoading()

	// Only https:// is allowed
	if (serverUrl.value.startsWith('http://')) {
		return setError(t('talk_desktop', 'Connecting over http:// is not allowed'))
	}

	// Check if valid URL
	try {
		// new URL will throw an exception on invalid URL
		new URL(serverUrl.value)
	} catch {
		return setError(t('talk_desktop', 'Invalid server address'))
	}

	// Check the certificate before actually sending a request
	if (!await window.TALK_DESKTOP.verifyCertificate(serverUrl.value)) {
		return setError(t('talk_desktop', 'SSL certificate error'))
	}

	if (loginGeneration !== myGeneration) {
		return
	}

	// Prepare to request the server
	window.TALK_DESKTOP.disableWebRequestInterceptor()
	appData.reset()
	appData.serverUrl = serverUrl.value

	// Check if there is Nextcloud server and get capabilities
	let capabilitiesResponse
	try {
		capabilitiesResponse = await getCapabilities(serverUrl.value)
	} catch {
		return setError(t('talk_desktop', 'Nextcloud server not found'))
	}

	if (loginGeneration !== myGeneration) {
		return
	}

	// Check if Talk is installed and enabled
	const talkCapabilities = capabilitiesResponse.capabilities.spreed
	if (!talkCapabilities) {
		return setError(t('talk_desktop', 'Nextcloud Talk is not installed in the server'))
	}

	// Check versions compatibilities
	const createVersionError = (componentName, minRequiredVersion, foundVersion) => t('talk_desktop', '{componentName} {minRequiredVersion} or higher is required but {foundVersion} is installed', {
		componentName,
		minRequiredVersion,
		foundVersion,
	})
	if (capabilitiesResponse.version.major < MIN_REQUIRED_NEXTCLOUD_VERSION) {
		return setError(createVersionError('Nextcloud', MIN_REQUIRED_NEXTCLOUD_VERSION, capabilitiesResponse.version.string))
	}
	if (parseInt(talkCapabilities.version.split('.')[0]) < MIN_REQUIRED_TALK_VERSION) {
		// TODO: use semver package and check not only major version?
		return setError(createVersionError('Nextcloud Talk', MIN_REQUIRED_TALK_VERSION, talkCapabilities.version))
	}

	// Try Login Flow v2 first, fall back to v1 WebView
	let credentials
	const v2Result = await tryLoginFlowV2()

	// Check if cancelled during the flow
	if (loginGeneration !== myGeneration) {
		return
	}

	if (v2Result === null) {
		// Login Flow v2 not available - fall back to v1 WebView
		setLoading()
		try {
			const maybeCredentials = await window.TALK_DESKTOP.openLoginWebView(serverUrl.value)
			if (loginGeneration !== myGeneration) {
				return
			}
			if (maybeCredentials instanceof Error) {
				return setError(maybeCredentials.message)
			}
			credentials = maybeCredentials
		} catch (error) {
			console.error(error)
			return setError(t('talk_desktop', 'Unexpected error'))
		}
	} else if (v2Result instanceof Error) {
		// Map machine-readable error code to localized message
		return setError(mapLoginFlowV2Error(v2Result.message))
	} else {
		credentials = v2Result
	}

	setLoading()

	// Add credentials to the request
	window.TALK_DESKTOP.enableWebRequestInterceptor(serverUrl.value, { credentials })
	// Save credentials
	appData.credentials = credentials

	// Get user's metadata and update capabilities for an authenticated user
	try {
		await refetchAppData(appData)
	} catch (error) {
		// A network connection was lost after successful requests or something unexpected went wrong
		console.error(error)
		return setError(t('talk_desktop', 'Login was successful but something went wrong.'))
	}

	if (loginGeneration !== myGeneration) {
		return
	}

	// Yay!
	appData.persist()

	const userid = credentials.user
	const serverUrlWithoutProtocol = serverUrl.value.replace(/^https?:\/\//, '')
	setAppConfigValue('accounts', [`${userid}@${serverUrlWithoutProtocol}`])

	setSuccess()
	await window.TALK_DESKTOP.login(appData.toJSON())
}
</script>

<template>
	<AppWindow :title="t('talk_desktop', 'Authentication')" class="wrapper">
		<div class="spacer">
			<div class="logo" />
		</div>
		<div class="login-box">
			<form v-if="state !== 'awaiting-browser'" @submit.prevent="login">
				<fieldset :disabled="state === 'loading'">
					<h2 class="login-box__header">
						{{ t('talk_desktop', 'Log in to {applicationName}', { applicationName: BUILD_CONFIG.applicationName }) }}
					</h2>
					<NcTextField
						v-model="rawServerUrl"
						:label="!enforceDomain ? t('talk_desktop', 'Server address') : undefined"
						:aria-label="enforceDomain ? t('talk_desktop', 'Server address') : undefined"
						:labelVisible="!enforceDomain"
						:inputClass="{ 'login-box__server--predefined': enforceDomain }"
						:placeholder="!enforceDomain ? 'https://try.nextcloud.com' : undefined"
						inputmode="url"
						:readonly="enforceDomain"
						:success="state === 'success'"
						:error="state === 'error'"
						:helperText="stateText"
						trailingButtonIcon="close"
						:showTrailingButton="allowReset"
						@trailingButtonClick="reset" />
					<NcButton
						v-if="state !== 'loading'"
						class="submit-button"
						variant="primary"
						type="submit"
						wide>
						<template #icon>
							<IconArrowRight :size="20" />
						</template>
						{{ t('talk_desktop', 'Log in') }}
					</NcButton>
					<NcButton
						v-else-if="state === 'loading'"
						class="submit-button"
						variant="primary"
						type="submit"
						wide>
						<template #icon>
							<NcLoadingIcon appearance="light" />
						</template>
						{{ t('talk_desktop', 'Logging in\u00a0…') }}
					</NcButton>
				</fieldset>
			</form>
			<div v-else class="awaiting-browser">
				<h2 class="login-box__header">
					{{ t('talk_desktop', 'Log in to {applicationName}', { applicationName: BUILD_CONFIG.applicationName }) }}
				</h2>
				<NcLoadingIcon :size="44" class="awaiting-browser__icon" />
				<p class="awaiting-browser__text">
					{{ t('talk_desktop', 'Complete the login in your browser.') }}
				</p>
				<NcButton
					class="awaiting-browser__button"
					variant="secondary"
					wide
					@click="reopenBrowser">
					{{ t('talk_desktop', 'Open the browser again') }}
				</NcButton>
				<NcButton
					class="awaiting-browser__button"
					variant="tertiary"
					wide
					@click="cancelLoginFlowV2">
					{{ t('talk_desktop', 'Cancel') }}
				</NcButton>
			</div>
		</div>
		<div class="spacer">
			<footer v-if="channel !== 'stable'" class="footer">
				{{ BUILD_CONFIG.applicationName }} {{ version }}
			</footer>
		</div>
	</AppWindow>
</template>

<style scoped>
.wrapper {
	display: flex;
	flex-direction: column;
	align-items: center;
	user-select: none;
	-webkit-app-region: drag;
}

.spacer {
	display: flex;
	flex: 1 0;
}

.logo {
	background: no-repeat center url('~../../../img/server-logo-plain.svg');
	background-size: contain;
	width: 175px;
	height: 130px;
	margin-top: auto;
}

.footer {
	margin-top: auto;
	margin-bottom: 2rem;
	color: var(--color-background-plain-text);
}

.login-box {
	color: var(--color-main-text);
	background-color: var(--color-main-background);
	padding: 16px;
	border-radius: var(--border-radius-large);
	box-shadow: 0 0 10px var(--color-box-shadow);
	width: 300px;
	-webkit-app-region: no-drag;
}

.login-box__header {
	text-align: center;
	margin-top: 0;
	font-size: 1.5em;
}

.submit-button {
	margin-top: 0.5rem;
}

.awaiting-browser {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.awaiting-browser__icon {
	margin: 1rem 0;
}

.awaiting-browser__text {
	text-align: center;
	margin: 0 0 0.5rem;
}

.awaiting-browser__button {
	margin-top: 0.25rem;
}

:deep(.login-box__server--predefined) {
	border-color: transparent !important;
	background-color: transparent !important;
}
</style>
