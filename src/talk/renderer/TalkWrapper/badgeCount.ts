/*
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Minimal shape of a conversation needed to compute the badge count.
 */
export type BadgeConversation = {
	type: number
	notificationLevel: number
	unreadMessages: number
	unreadMention: boolean
	unreadThreads?: number
	isArchived?: boolean
}

/**
 * Count conversations with unread notifications.
 *
 * A conversation is counted at most once. Besides unread messages and
 * mentions, conversations with unread threads (replies/mentions the user is
 * involved in) are also counted, because thread replies are excluded from the
 * conversation's unreadMessages.
 *
 * @param conversations - The list of conversations to inspect
 * @return The number of conversations with unread notifications
 */
export function countUnreadConversations(conversations: BadgeConversation[]): number {
	return conversations.reduce((count: number, conversation: BadgeConversation) => {
		// Filter out archived conversations
		if (conversation.isArchived) {
			return count
		}

		// Muted with "Never notify"
		if (conversation.notificationLevel === 3) {
			return count
		}

		// ONE_TO_ONE || ONE_TO_ONE_FORMER
		if ((conversation.type === 1 || conversation.type === 5) && (conversation.unreadMessages || conversation.unreadThreads)) {
			return count + 1
		}

		// Any other group conversation
		if (
			// Always notify && any unread message
			(conversation.notificationLevel === 1 && conversation.unreadMessages)
			// Mentioned
			|| conversation.unreadMention
			// Unread threads the user is involved in
			|| conversation.unreadThreads
		) {
			return count + 1
		}

		return count
	}, 0)
}
