# ライセンスの再点検（2026-10-27）

対象は遠回りメモの自作ソース、固定したnpm依存、生成HTML、Android APKです。確認元のソースはコミット 6fac17b930c0d3b3a6bafb5681a6105319028c68。以下の不足表示を補った版で配布物を再生成します。

## 確認結果と修正

自作部分の LICENSE は、著作権者を alpenabendrote、年を2026とした標準MIT本文です。第三者部分のライセンスを置き換えません。

ルートのLICENSEだけを集める方法では、内部に取り込まれたコードの表示が不足していました。次を THIRD_PARTY_NOTICES.txt、ヘルプ、HTML、APKへ追加しました。

- Capacitor Androidの FileUtils.java：Ivan PusicのMIT許諾文を、固定バージョンのソースヘッダーからそのまま抽出。
- Capacitor Androidの AndroidProtocolHandler.java：Chromium Authorsの2012年BSD条件全文。UriMatcher.java と WebViewLocalServer.java のApacheヘッダーも保持。
- Rolldownの生成ヘルパー：上流の THIRD-PARTY-LICENSE にあるRollup contributorsとEvan WallaceのMIT本文。
- Androidテンプレートの未使用 ic_launcher_foreground.xml：Capacitor CLIテンプレートと同一のAndroidロボット画像。Googleの指定帰属表示、出典、CC BY 3.0全文を追加。現在表示するメモ型アイコンは別の自作画像です。

## 照合方法

- 実行用npm依存10件とVite・Rolldown・Capacitor CLIの計13配布物を公式npmレジストリから取得し、package-lock.json のSHA-512と一致することを確認。各配布物のルートのLICENSE等をインストール済みのファイルと照合しました。
- 実行用npm依存はMIT許諾文9件とtslibの0BSD本文です。@capacitor/synapse@1.0.4 はメタデータにISCとありますが、同じ配布物の LICENSE.md はMITです。この食い違いを明記し、配布されたMIT許諾文を保持しています。
- APKの解決済みMaven依存51件について、Google Maven・Maven Centralの同じバージョンのPOMを確認。50件がApache-2.0、ionfilesystem-android:1.1.1 がMITです。Guavaは親POM、IonicはPOMの参照先の実ライセンスも確認しました。
- 同じ51件のAAR/JARを取得し、内部JARも再帰的に確認。検出したLICENSE/NOTICE等9ファイルの本文は、既存APKの native-third-party-notices.txt に全て含まれていました。重複する変種のAndroidX coreの記録は1件として数えています。
- 自作MIT、Apache-2.0、ionfilesystemの本文を正式な許諾文と照合。Gradle wrapperの元のヘッダーとJAR内の許諾文も保持します。
- APK検査は同梱本文と生成元の完全一致、および今回追加した帰属表示を確認するよう強化。ネイティブ依存の判定はグループ名による推測をやめ、licenses/native-components.json の確認済みバージョンに限定します。

## 一次資料

- [MIT原文（OSI）](https://opensource.org/license/mit)
- [Apache License 2.0原文](https://www.apache.org/licenses/LICENSE-2.0.txt)
- [Chromium 2012年のLICENSE](https://github.com/chromium/chromium/blob/20.0.1132.57/LICENSE)
- [Rolldownの上流帰属表示](https://github.com/rolldown/rolldown/blob/v1.2.15/THIRD-PARTY-LICENSE)
- [GoogleのAndroidロボット帰属指定](https://developer.android.com/distribute/marketing-tools/brand-guidelines#android-robot)
- [CC BY 3.0原文](https://creativecommons.org/licenses/by/3.0/legalcode.txt)
- [Ionic filesystemのLICENSE](https://github.com/ionic-team/ion-android-filesystem/blob/main/LICENSE)

各ネイティブ依存のバージョン別POMのURLは licenses/native-components.json に記録しています。npm配布元と版は package-lock.json と THIRD_PARTY_NOTICES.txt に記録しています。

## 範囲

今回の固定バージョンと確認した配布物に関する技術的な照合結果です。第三者の全権利関係や法的な無違反を保証するものではありません。依存・テンプレート・画像・生成ツールを更新した場合は再確認が必要です。ビルド専用のJDK・Android SDK等をアプリへ同梱しているという意味ではありません。
