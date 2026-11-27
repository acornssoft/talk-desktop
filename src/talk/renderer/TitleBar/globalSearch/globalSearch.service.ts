/*
 * SPDX-FileCopyrightText: 2026 Acorns Soft
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { UnifiedSearchEntry } from './globalSearch.utils.ts'

import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'

type UnifiedSearchResult = {
	name: string
	isPaginated: boolean
	entries: UnifiedSearchEntry[]
	cursor: number | string | null
}

/**
 * acorns: 参加しているすべての会話からメッセージを探す。
 * Web 版ヘッダーの全体検索と同じ統合検索プロバイダ `talk-message` を使う。
 * `from` を付けないので、開いている会話も対象に入る。
 *
 * @param params - 検索条件
 * @param params.term - 検索語
 * @param params.limit - 1 回に取る件数
 * @param params.cursor - 続きを取るときの位置(前回の応答の cursor)
 * @param signal - 取り消し用
 */
export async function searchAllMessages(
	{ term, limit, cursor }: { term: string, limit: number, cursor?: number | string | null },
	signal?: AbortSignal,
): Promise<UnifiedSearchResult> {
	const response = await axios.get(generateOcsUrl('search/providers/talk-message/search'), {
		params: {
			term,
			limit,
			cursor: cursor || undefined,
		},
		signal,
	})
	return response.data.ocs.data
}
