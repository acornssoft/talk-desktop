<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# l10n-acorns — 独自に補った翻訳(`talk_desktop` アプリ自身の文字列)

`l10n/` は Transifex が生成するディレクトリで、上流の l10n 同期のたびに丸ごと置き換わる。
このディレクトリはそこに重ねる**独自訳の正典**で、次の 3 種類を持つ。

1. 上流の Transifex に訳が無く英語のまま出ていた文字列(設定画面、画面共有ピッカー、
   ユーザーステータス、証明書警告、アップグレード要求画面など)
2. fork 固有の機能で追加した文字列(Login Flow v2 のログイン経過表示、ヘルプの Source Code)
3. 上流訳の不具合を上書きしたもの

## 再生成

```sh
node l10n-acorns/apply.mjs          # l10n/<lang>.{json,js} を作り直す
node l10n-acorns/apply.mjs --check  # 反映漏れがあれば exit 1
```

冪等なので何度実行してもよい。**上流をマージして `l10n/` が更新されたら、必ず実行し直す**。
翻訳を追加・修正するときは `l10n/` を直接触らず、`l10n-acorns/<lang>.json` に書いて
`apply.mjs` を実行する。

## `l10n-spreed/` との違い

| ディレクトリ | 対象アプリ | 反映のしかた |
| --- | --- | --- |
| `l10n-acorns/` | `talk_desktop`(このアプリ自身) | ビルド前に `apply.mjs` で `l10n/` を再生成 |
| `l10n-spreed/` | `spreed`(同梱する Talk 本体) | 実行時に `src/shared/setupWebPage.js` が上流訳の後に register |

`l10n-spreed/` の内容は `acornssoft/spreed` の `l10n-acorns/ja.json` に取り込んで
spreed 側の `l10n/ja.json` に適用済みなので、同梱 spreed が `acorns/main` なら冗長。
Web 版でも同じ訳が出るようにするため、追加・修正は spreed 側を正典とする。

## 日本語版の現状

`l10n/ja.json` は `l10n/en_GB.json` のソース文字列 138 件のうち 137 件を訳出済み。
残る 1 件 `Talk Desktop` は製品名なので意図的に未訳。加えて fork 固有の 7 件を収録。
