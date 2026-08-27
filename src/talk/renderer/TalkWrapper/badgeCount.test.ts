/*
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countUnreadConversations } from './badgeCount.ts'

test('counts a conversation with unread threads even when unreadMessages is 0', () => {
	assert.equal(countUnreadConversations([
		{ type: 2, notificationLevel: 2, unreadMessages: 0, unreadMention: false, unreadThreads: 1, isArchived: false },
	]), 1)
})

test('does not double count a conversation with both unread messages and threads', () => {
	assert.equal(countUnreadConversations([
		{ type: 1, notificationLevel: 1, unreadMessages: 3, unreadMention: false, unreadThreads: 2, isArchived: false },
	]), 1)
})

test('does not count archived conversations', () => {
	assert.equal(countUnreadConversations([
		{ type: 2, notificationLevel: 1, unreadMessages: 5, unreadMention: true, unreadThreads: 3, isArchived: true },
	]), 0)
})

test('does not count conversations muted with "Never notify" (notificationLevel 3)', () => {
	assert.equal(countUnreadConversations([
		{ type: 2, notificationLevel: 3, unreadMessages: 5, unreadMention: true, unreadThreads: 3, isArchived: false },
	]), 0)
})

test('does not count a group conversation without mention and with no unread threads', () => {
	assert.equal(countUnreadConversations([
		{ type: 2, notificationLevel: 2, unreadMessages: 4, unreadMention: false, unreadThreads: 0, isArchived: false },
	]), 0)
})
