/*
 * SPDX-FileCopyrightText: 2026 Acorns Soft
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatResultTime, toMessageSearchResult } from './globalSearch.utils.ts'

const baseEntry = {
	title: '佐藤 貴宣 in タッチワン',
	subline: 'CSVデータをもらうようにします',
	attributes: {
		conversation: 'abc123',
		messageId: '42',
		actorId: 'sato',
		actorType: 'users',
		timestamp: '1764226800',
	},
}

test('converts a plain message', () => {
	assert.deepEqual(toMessageSearchResult(baseEntry), {
		key: 'abc123/42',
		token: 'abc123',
		messageId: 42,
		threadId: undefined,
		title: '佐藤 貴宣 in タッチワン',
		subline: 'CSVデータをもらうようにします',
		actorId: 'sato',
		actorType: 'users',
		timestamp: 1764226800,
	})
})

test('keeps threadId for a reply inside a thread', () => {
	const result = toMessageSearchResult({ ...baseEntry, attributes: { ...baseEntry.attributes, threadId: '7' } })
	assert.equal(result?.threadId, 7)
})

test('drops threadId for the thread root itself', () => {
	const result = toMessageSearchResult({ ...baseEntry, attributes: { ...baseEntry.attributes, threadId: '42' } })
	assert.equal(result?.threadId, undefined)
})

test('returns null when the conversation token is missing', () => {
	assert.equal(toMessageSearchResult({ ...baseEntry, attributes: { ...baseEntry.attributes, conversation: undefined } }), null)
})

test('returns null when the message id is not a positive integer', () => {
	assert.equal(toMessageSearchResult({ ...baseEntry, attributes: { ...baseEntry.attributes, messageId: 'x' } }), null)
	assert.equal(toMessageSearchResult({ ...baseEntry, attributes: { ...baseEntry.attributes, messageId: undefined } }), null)
})

test('formats today as time only', () => {
	const now = new Date(2026, 10, 27, 20, 0)
	const ts = new Date(2026, 10, 27, 15, 4).getTime() / 1000
	assert.equal(formatResultTime(ts, now, 'ja'), '15:04')
})

test('formats this year as month and day', () => {
	const now = new Date(2026, 10, 27, 20, 0)
	const ts = new Date(2026, 2, 5, 9, 0).getTime() / 1000
	assert.equal(formatResultTime(ts, now, 'ja'), '3月5日')
})

test('formats older dates with the year', () => {
	const now = new Date(2026, 10, 27, 20, 0)
	const ts = new Date(2025, 11, 31, 9, 0).getTime() / 1000
	assert.equal(formatResultTime(ts, now, 'ja'), '2025年12月31日')
})

test('returns empty string for a missing timestamp', () => {
	assert.equal(formatResultTime(0), '')
})
