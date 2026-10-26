# Androidで単体利用する

普段はReact / TypeScript / Viteで開発し、必要なときにCapacitorでAPKを作ります。画面・ヘルプ・量子計算・Web WorkerはAPKに同梱され、インストール後はPCやサーバー、通信接続なしで使えます。

## GitHubから試用APKを作る

1. GitHubの **Actions → Android APK → Run workflow** でmainを実行します。
2. 実行画面のArtifactsから **quantum-notepad-debug** をダウンロードしてZIPを展開します。
3. 中のapp-debug.apkをAndroid端末へ移して開き、インストールします。提供元の許可はAndroid側の案内に従います。

このリポジトリへのAndroid関連の変更時にも同じワークフローを実行します。APKは30日間保持します。CIでは通信を切ったAndroid 15エミュレーターで、起動、量子検索、貼り付け・削除・堆積のWorker、ネイティブ保存、長い本文、画面再生成後の復元を検証します。通信権限がないこと、フォント自動取得が無効なこと、オフラインでライセンス全文を開けることも確認します。別途、署名なしrelease APKを検査し、デバッグ無効・INTERNET権限なし・ライセンス同梱を確認します。署名なしの検査用APKは配布しません。テスト用パッケージは末尾.smokeで分離しています。

GitHub製のdebug APKは試用向けです。実行ごとに署名鍵が変わるため、別の実行のAPKでは上書き更新できない場合があります。常用する版は以下のローカル手順で同じ署名鍵を使って作成してください。更新できない場合にアプリを削除するとメモも消えるので、先にJSONを書き出して保管します。

## PCで開発する

~~~sh
npm ci
npm run dev
~~~

Android用のコードはandroid/、共通の画面・計算はsrc/です。Capacitorの設定はcapacitor.config.jsonです。TypeScript 7とNode 22.13でも設定を読めるよう、この設定だけJSONにしています。server.urlは設定しません。

## PCでAPKを作る

必要な環境：

- Node.js 22.13以降の22系、または対応する新しいLTS
- Android Studio 2025.2.1以降
- Android SDK Platform 36とSDK Build-Tools（Android StudioのSDK Managerで導入）
- JDK 21（Android Studioに付属するjbrを利用可能）

Windows PowerShellの設定例：

~~~powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run android:apk
~~~

Webをビルドし、Androidプロジェクトへ同期してからassembleDebugを実行します。完成品はartifacts/quantum-notepad-debug.apkです。初回ビルドではGradle等のダウンロードが必要ですが、インストール後の利用には不要です。同じPCのdebug署名鍵を維持すれば、同じアプリへ上書き更新できます。

Android Studioで操作する場合：

~~~sh
npm run android:open
~~~

Android Studioで端末やエミュレーターを選んで実行できます。Web側を変更したらnpm run android:syncで最新のdistをコピーします。distやコピー済みWeb資産はGitに保存せず、毎回生成します。

## 常用・配布用の署名APK

Android Studioの **Build → Generate Signed App Bundle or APK → APK** で自分の署名鍵を作成・保管し、以後も同じ鍵を使います。APK更新には同じapplicationIdと署名鍵が必要です。

コマンドで署名ビルドする場合は、android/keystore.propertiesに次の項目を自分の値で設定します。このファイルと鍵はGitの対象外です。

~~~properties
storeFile=C:/your-private-location/quantum-notepad.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=YOUR_KEY_ALIAS
keyPassword=YOUR_KEY_PASSWORD
~~~

~~~sh
npm run android:apk -- --release
~~~

完成品はartifacts/quantum-notepad-release.apkです。更新時はappVersionCodeを増やします。PowerShellなら次のように指定できます。

~~~powershell
$env:ORG_GRADLE_PROJECT_appVersionCode = '2'
$env:ORG_GRADLE_PROJECT_appVersionName = '0.1.1'
npm run android:apk -- --release
~~~

署名鍵は再発行しても同じアプリの更新には使えないため、手元に保管してください。鍵やパスワードをGitHubへ追加する必要はありません。

## 配布時のライセンスと通信

自作部分はMITです。ヘルプ内の全文表示に加え、APKにはLICENSE・THIRD_PARTY_NOTICES.txt・native-third-party-notices.txtを同梱します。ネイティブ依存の追加LICENSE/NOTICEはGradleがビルド時に収集します。依存を更新した際は著作権表示とライセンスの変更も確認してください。

AndroidManifestではライブラリが追加するINTERNET権限もマージ時に除去し、絵文字フォントの自動取得も無効にします。CapacitorのローカルWebView資産はネットワークを経由せず読み込みます。参考資料を押して開く外部ブラウザや、選択した共有先は別アプリです。

公開配布には上記の自分の鍵で署名したrelease版を使ってください。Actionsのdebug版は引き続き動作確認用です。秘密鍵や署名パスワードを公開リポジトリへ入れないでください。

## メモの保存・移行

AndroidではCapacitor Preferences（アプリ専用のSharedPreferences）に保存します。起動時は保存済みデータを読んでから画面を開き、非同期保存は順番を保ちます。読み込みに失敗したデータを空のメモで上書きしません。ブラウザ版は従来のlocalStorageを使います。アプリのアンインストールやデータ消去でメモは消えます。OSの自動バックアップは無効にしています。

ブラウザ版とAPKのデータは自動共有されません。

1. 元の環境で **JSONを書き出す**。
2. AndroidへJSONファイルを移す。
3. アプリの **JSONを読み込む** で選ぶ。

Androidの書き出しはJSONファイルを作ってシステムの共有・保存先選択を開きます。保存先や送信先は自分で選びます。読み込みは現在のメモへ追加し、既存の本文を上書きしません。同じID・タイトル・本文・更新日時のメモは重複追加せず、IDが同じで内容が違う場合は別IDで追加します。合計128件を超える場合は読み込み全体を中止します。ファイルには伏せた本文とゼノン状態も含まれ、暗号化はしません。

Android 7（API 24）以降、Android System WebView / Chrome 111以降を前提にしています。実機固有のキーボード・共有先・ファイル選択の動作は、お使いの端末でも確認してください。

[Capacitorの環境要件](https://capacitorjs.com/docs/getting-started/environment-setup) / [保存API](https://capacitorjs.com/docs/apis/preferences)
