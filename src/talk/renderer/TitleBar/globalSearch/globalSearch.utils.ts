/*
 * SPDX-FileCopyrightText: 2026 Acorns Soft
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * acorns: タイトルバーの「全会話のメッセージ検索」で使う純関数。
 * サーバーの統合検索プロバイダ `talk-message`(spreed の lib/Search/MessageSearch.php)の
 * 結果 1 件を、一覧に出す形に変換する。
 */

/** 統合検索 API が返す 1 件(必要な項目だけ) */
export type UnifiedSearchEntry = {
	thumbnailUrl?: string
	/** 「{user} in {conversation}」をサーバーの言語で埋めたもの */
	title: string
	/** メッセージ本文(長いと一致箇所の手前で切られている) */
	subline: string
	resourceUrl?: string
	attributes: Record<string, string | undefined>
}

/** 一覧に出す 1 件 */
export type MessageSearchResult = {
	key: string
	token: string
	messageId: number
	/** スレッド内の返信なら、そのスレッドの ID。スレッドの起点や通常の発言は undefined */
	threadId?: number
	title: string
	subline: string
	actorId: string
	actorType: string
	/** UNIX 秒 */
	timestamp: number
}

/**
 * 検索結果 1 件を一覧用に変換する。会話トークンかメッセージ ID が無いものは飛べないので null
 *
 * @param entry - 統合検索の結果 1 件
 */
export function toMessageSearchResult(entry: UnifiedSearchEntry): MessageSearchResult | null {
	const token = entry.attributes.conversation
	const messageId = Number(entry.attributes.messageId)
	if (!token || !Number.isInteger(messageId) || messageId <= 0) {
		return null
	}

	// 右ペインの検索(spreed の SearchMessagesTab.vue)と同じ規則:
	// スレッドの起点(threadId === messageId)は会話の本流に出ているので threadId を付けない
	const rawThreadId = entry.attributes.threadId
	const threadId = rawThreadId && Number(rawThreadId) !== messageId ? Number(rawThreadId) : undefined

	return {
		key: `${token}/${messageId}`,
		token,
		messageId,
		threadId: Number.isInteger(threadId) ? threadId : undefined,
		title: entry.title,
		subline: entry.subline,
		actorId: entry.attributes.actorId ?? '',
		actorType: entry.attributes.actorType ?? '',
		timestamp: Number(entry.attributes.timestamp) || 0,
	}
}

/**
 * 発言時刻を短く表す。今日なら時刻だけ、今年なら月日、それより前は年月日
 *
 * @param timestamp - UNIX 秒
 * @param now - 現在時刻(テスト用)
 * @param locale - ロケール(テスト用。省略時は実行環境の既定)
 */
export function formatResultTime(timestamp: number, now: Date = new Date(), locale?: string): string {
	if (!timestamp) {
		return ''
	}
	const date = new Date(timestamp * 1000)
	const isSameYear = date.getFullYear() === now.getFullYear()
	const isSameDay = isSameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()

	if (isSameDay) {
		return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
	}
	if (isSameYear) {
		return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
	}
	return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}
