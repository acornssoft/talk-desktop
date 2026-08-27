/*
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ref, watchEffect } from 'vue'
import { countUnreadConversations } from './badgeCount.ts'

/**
 * Set badge counter according to Talk unread counts
 */
export function useBadgeCountIntegration() {
	const count = ref(0)

	window.OCA.Talk.instance.$store.watch(
		() => countUnreadConversations(window.OCA.Talk.instance.$store.getters.conversationsList),
		(newValue: number) => {
			count.value = newValue
		},
		{ immediate: true },
	)

	watchEffect(() => {
		window.TALK_DESKTOP.setBadgeCount(count.value)
	})
}
