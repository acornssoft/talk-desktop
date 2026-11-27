<!--
  - SPDX-FileCopyrightText: 2026 Acorns Soft
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
/*
 * acorns: タイトルバー中央の「全会話のメッセージ検索」。
 * Web 版はヘッダーの全体検索で会話をまたいでメッセージを探せるが、デスクトップ版は
 * ヘッダーを独自のタイトルバーに置き換えているため、その入口が無かった。
 * 検索はサーバーの統合検索プロバイダ talk-message、移動は右ペインの検索と同じ経路を使う。
 */

import type { MessageSearchResult } from './globalSearch.utils.ts'

import { isCancel } from '@nextcloud/axios'
import { t } from '@nextcloud/l10n'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import NcAvatar from '@nextcloud/vue/components/NcAvatar'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import IconClose from 'vue-material-design-icons/Close.vue'
import IconMagnify from 'vue-material-design-icons/Magnify.vue'
import { openMessage } from '../../TalkWrapper/talk.service.ts'
import { searchAllMessages } from './globalSearch.service.ts'
import { formatResultTime, toMessageSearchResult } from './globalSearch.utils.ts'

const SEARCH_LIMIT = 20

// spreed の訳(右ペインの検索欄)をそのまま使うため、キーは spreed と同じ普通の空白にする
// eslint-disable-next-line @nextcloud/l10n-non-breaking-space
const searchPlaceholder = t('spreed', 'Search messages …')

const root = useTemplateRef('root')
const input = useTemplateRef('input')

const term = ref('')
const results = ref<MessageSearchResult[]>([])
const cursor = ref<number | string | null>(null)
const isExhausted = ref(false)
const isLoading = ref(false)
const hasError = ref(false)
const isOpen = ref(false)
const activeIndex = ref(-1)
/** 結果が今の検索語のものか(入力直後で未取得のときは false) */
const searchedTerm = ref('')

const trimmedTerm = computed(() => term.value.trim())
const showPanel = computed(() => isOpen.value && trimmedTerm.value !== '')
const canLoadMore = computed(() => !isExhausted.value && !isLoading.value && results.value.length > 0)
const showEmpty = computed(() => !isLoading.value && !hasError.value && searchedTerm.value === trimmedTerm.value && results.value.length === 0)

let abortController: AbortController | null = null

/**
 * 進行中の検索を取り消す
 */
function cancelSearch() {
	abortController?.abort()
	abortController = null
}

/**
 * 検索して結果を取り込む
 *
 * @param isNew - 検索語が変わった新しい検索か(false なら続きを取る)
 */
async function fetchResults(isNew: boolean) {
	const searchTerm = trimmedTerm.value
	if (searchTerm === '') {
		return
	}

	cancelSearch()
	const controller = new AbortController()
	abortController = controller

	if (isNew) {
		results.value = []
		cursor.value = null
		isExhausted.value = false
		activeIndex.value = -1
	}
	isLoading.value = true
	hasError.value = false

	try {
		const data = await searchAllMessages({ term: searchTerm, limit: SEARCH_LIMIT, cursor: cursor.value }, controller.signal)
		const items = data.entries
			.map(toMessageSearchResult)
			.filter((item): item is MessageSearchResult => item !== null)
		// 同じ発言が二度並ばないように(続きの取得で境目が重なることがある)
		const known = new Set(results.value.map((item) => item.key))
		results.value = results.value.concat(items.filter((item) => !known.has(item.key)))
		cursor.value = data.cursor
		isExhausted.value = data.entries.length < SEARCH_LIMIT
		searchedTerm.value = searchTerm
	} catch (error) {
		if (isCancel(error)) {
			return
		}
		console.error('Error searching for messages', error)
		hasError.value = true
	} finally {
		if (abortController === controller) {
			abortController = null
			isLoading.value = false
		}
	}
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined

/**
 * 入力が 300ms 止まったら検索する
 */
function scheduleSearch() {
	clearTimeout(debounceTimer)
	debounceTimer = setTimeout(() => fetchResults(true), 300)
}

watch(trimmedTerm, (value) => {
	if (value === '') {
		clearTimeout(debounceTimer)
		cancelSearch()
		results.value = []
		searchedTerm.value = ''
		hasError.value = false
		isLoading.value = false
		activeIndex.value = -1
		return
	}
	isOpen.value = true
	scheduleSearch()
})

onBeforeUnmount(() => {
	clearTimeout(debounceTimer)
	cancelSearch()
})

/**
 * 結果を開く。パネルは閉じるが、検索語は残して入れ直せるようにする
 *
 * @param item - 開く結果
 */
async function openResult(item: MessageSearchResult) {
	isOpen.value = false
	input.value?.blur()
	await openMessage(item.token, item.messageId, item.threadId)
}

/**
 * 検索語を消して入力欄に戻る
 */
function clearSearch() {
	term.value = ''
	input.value?.focus()
}

/**
 * 上下キーで選択を動かし、選んだ結果を見えるところまで送る
 *
 * @param step - 移動量(+1 / -1)
 */
function moveActive(step: number) {
	if (!showPanel.value || results.value.length === 0) {
		return
	}
	const count = results.value.length
	activeIndex.value = activeIndex.value < 0
		? (step > 0 ? 0 : count - 1)
		: (activeIndex.value + step + count) % count
	nextTick(() => {
		root.value?.querySelector(`[data-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
	})
}

/**
 * 入力欄のキー操作
 *
 * @param event - キーボードイベント
 */
function onKeydown(event: KeyboardEvent) {
	if (event.isComposing) {
		// IME の変換確定の Enter / Esc は検索に使わない
		return
	}
	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault()
			moveActive(1)
			break
		case 'ArrowUp':
			event.preventDefault()
			moveActive(-1)
			break
		case 'Enter': {
			const item = results.value[activeIndex.value] ?? results.value[0]
			if (showPanel.value && item) {
				event.preventDefault()
				openResult(item)
			}
			break
		}
		case 'Escape':
			event.preventDefault()
			if (isOpen.value && term.value !== '') {
				isOpen.value = false
			} else {
				term.value = ''
				input.value?.blur()
			}
			break
	}
}

/**
 * 検索欄の外にフォーカスが移ったらパネルを閉じる
 *
 * @param event - フォーカスイベント
 */
function onFocusout(event: FocusEvent) {
	if (!root.value?.contains(event.relatedTarget as Node | null)) {
		isOpen.value = false
	}
}

/**
 * 入力欄に戻ったら、前回の結果をそのまま見せる
 */
function onFocus() {
	isOpen.value = true
}
</script>

<template>
	<div
		ref="root"
		class="global-search"
		:class="{ 'global-search--open': showPanel }"
		@focusout="onFocusout">
		<div class="global-search__field">
			<IconMagnify class="global-search__icon" :size="20" />
			<input
				ref="input"
				v-model="term"
				class="global-search__input"
				type="search"
				role="combobox"
				aria-autocomplete="list"
				aria-controls="global-search-results"
				:aria-expanded="showPanel"
				:aria-activedescendant="activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined"
				:aria-label="searchPlaceholder"
				:placeholder="searchPlaceholder"
				spellcheck="false"
				autocomplete="off"
				@focus="onFocus"
				@keydown="onKeydown">
			<button
				v-if="term !== ''"
				class="global-search__clear"
				type="button"
				:aria-label="t('spreed', 'Cancel search')"
				:title="t('spreed', 'Cancel search')"
				@click="clearSearch">
				<IconClose :size="16" />
			</button>
		</div>

		<div
			v-show="showPanel"
			id="global-search-results"
			class="global-search__panel"
			role="listbox"
			:aria-label="t('spreed', 'Messages')">
			<ul v-if="results.length > 0" class="global-search__list">
				<li
					v-for="(item, index) in results"
					:id="`global-search-result-${index}`"
					:key="item.key"
					role="option"
					:aria-selected="index === activeIndex"
					:data-index="index">
					<button
						class="global-search__item"
						:class="{ 'global-search__item--active': index === activeIndex }"
						type="button"
						tabindex="-1"
						@mousedown.prevent
						@mouseenter="activeIndex = index"
						@click="openResult(item)">
						<NcAvatar
							class="global-search__avatar"
							:user="item.actorType === 'users' ? item.actorId : undefined"
							:displayName="item.title"
							:isNoUser="item.actorType !== 'users'"
							:size="32"
							hideStatus
							disableMenu
							disableTooltip />
						<span class="global-search__text">
							<span class="global-search__title-row">
								<span class="global-search__title">{{ item.title }}</span>
								<span class="global-search__time">{{ formatResultTime(item.timestamp) }}</span>
							</span>
							<span class="global-search__subline">{{ item.subline }}</span>
						</span>
					</button>
				</li>
			</ul>

			<div v-if="hasError" class="global-search__message">
				{{ t('spreed', 'An error occurred while performing the search') }}
			</div>
			<div v-else-if="showEmpty" class="global-search__message">
				{{ t('spreed', 'No results found') }}
			</div>

			<div v-if="isLoading" class="global-search__loading">
				<NcLoadingIcon :size="24" />
			</div>
			<button
				v-else-if="canLoadMore"
				class="global-search__more"
				type="button"
				@mousedown.prevent
				@click="fetchResults(false)">
				{{ t('spreed', 'Load more results') }}
			</button>
		</div>
	</div>
</template>

<style scoped>
.global-search {
	position: relative;
	flex: 0 1 560px;
	min-width: 180px;
	height: 100%;
	display: flex;
	align-items: center;
	/* タイトルバーのドラッグ領域から外して、クリックと入力を受けられるようにする */
	-webkit-app-region: no-drag;
	user-select: none;
}

.global-search__field {
	position: relative;
	display: flex;
	align-items: center;
	width: 100%;
	height: 36px;
	border-radius: var(--border-radius-element, 8px);
	/* Web 版ヘッダーの検索欄に合わせて、テーマ色の上に半透明で重ねる */
	background-color: rgba(0, 0, 0, 0.15);
	color: var(--color-background-plain-text);
	transition: background-color 0.1s ease;
}

.global-search__field:hover {
	background-color: rgba(0, 0, 0, 0.22);
}

.global-search__field:focus-within {
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.global-search__icon {
	position: absolute;
	inset-inline-start: 10px;
	pointer-events: none;
	opacity: 0.85;
}

.global-search__input {
	flex: 1;
	min-width: 0;
	height: 100%;
	margin: 0;
	padding-block: 0;
	padding-inline: 38px 34px;
	border: none !important;
	border-radius: inherit;
	background: transparent !important;
	box-shadow: none !important;
	outline: none;
	color: inherit !important;
	font-size: var(--default-font-size);
	user-select: text;
}

.global-search__input::placeholder {
	color: inherit;
	opacity: 0.85;
}

/* type=search の既定の × は使わない(自前のボタンに揃える) */
.global-search__input::-webkit-search-cancel-button {
	display: none;
}

.global-search__field:not(:focus-within) .global-search__input {
	text-align: center;
}

.global-search__clear {
	position: absolute;
	inset-inline-end: 6px;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	min-height: 0;
	margin: 0;
	padding: 0;
	border: none;
	border-radius: 50%;
	background: transparent;
	color: inherit;
	cursor: pointer;
}

.global-search__clear:hover {
	background-color: rgba(127, 127, 127, 0.2);
}

.global-search__panel {
	position: absolute;
	top: calc(50% + 22px);
	inset-inline: 0;
	z-index: 10000;
	max-height: min(70vh, 560px);
	overflow-y: auto;
	padding: var(--default-grid-baseline, 4px);
	border-radius: var(--border-radius-large, 12px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-shadow: 0 2px 12px var(--color-box-shadow, rgba(0, 0, 0, 0.3));
}

.global-search__list {
	margin: 0;
	padding: 0;
	list-style: none;
}

.global-search__item {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	min-height: 0;
	margin: 0;
	padding: 6px 8px;
	border: none;
	border-radius: var(--border-radius-element, 8px);
	background: transparent;
	color: inherit;
	font-weight: normal;
	text-align: start;
	cursor: pointer;
}

.global-search__item--active {
	background-color: var(--color-background-hover);
}

.global-search__avatar {
	flex-shrink: 0;
}

.global-search__text {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-width: 0;
}

.global-search__title-row {
	display: flex;
	align-items: baseline;
	gap: 8px;
}

.global-search__title {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	color: var(--color-text-maxcontrast);
	font-size: var(--font-size-small, 13px);
	text-overflow: ellipsis;
	white-space: nowrap;
}

.global-search__time {
	flex-shrink: 0;
	color: var(--color-text-maxcontrast);
	font-size: var(--font-size-small, 13px);
}

.global-search__subline {
	display: -webkit-box;
	overflow: hidden;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-height: 1.4;
	overflow-wrap: anywhere;
}

.global-search__message {
	padding: 12px;
	color: var(--color-text-maxcontrast);
	text-align: center;
}

.global-search__loading {
	display: flex;
	justify-content: center;
	padding: 8px;
}

.global-search__more {
	width: 100%;
	min-height: 0;
	margin: 0;
	padding: 8px;
	border: none;
	border-radius: var(--border-radius-element, 8px);
	background: transparent;
	color: var(--color-primary-element);
	cursor: pointer;
}

.global-search__more:hover {
	background-color: var(--color-background-hover);
}
</style>
