# Radiko Pages Player

GitHub Pagesなどの**静的ホスティングだけ**で配布できる、ブラウザ内Radiko AACプレイヤーです。

- バックエンドなし
- yt-dlpなし
- FFmpegなし
- MP3変換なし
- 音声の中継・保存なし

認証、HLS playlist/segment取得、AACデコード、PCM再生をすべて利用者のブラウザ内で実行します。AACは同梱したFAAD2ベースのWebAssemblyデコーダーで処理するため、ブラウザがHE-AACをネイティブ再生できない場合でも動作します。

## 使い方

1. Pagesを開く。
2. `📻 Radiko Player を登録`をブックマークバーへドラッグする。
3. ブックマークを1回クリックし、`https://api.radiko.jp/`へ移動する。
4. 同じブックマークをもう一度クリックする。
5. プレイヤーで地域・局を選び、再生する。

2回必要なのは、通常のGitHub PagesオリジンからRadikoの認証レスポンスをJavaScriptで読めないためです。2回目の実行は `api.radiko.jp` から作られた `about:blank` ウィンドウへ静的プレイヤーを読み込み、同一オリジンとして認証します。

## 構成

- `index.html` — ブックマークレット登録ページ
- `player.js` — UI、認証、HLS取得、AAC→PCM、Web Audio再生
- `data.js` — 地域・局・アプリ認証用静的データ
- `vendor/aac.js`, `vendor/aac.wasm` — FAAD2ベースAACデコーダー
- `vendor/source/` — デコーダーの対応ソース

## 技術フロー

1. `/apparea/auth1` と `/apparea/auth2` で選択地域のトークンを取得。
2. master/media playlistだけに `X-Radiko-AuthToken` と `X-Radiko-AreaId` を付けて取得。
3. AAC segmentは認証ヘッダーなしでCDNから取得。
4. ID3を外し、MPEG-2 HE-AAC/ADTSをWASMで16-bit PCMへデコード。
5. Web Audioの`AudioBufferSourceNode`へ連続スケジュール。
6. 約65分後、または401/403時に再認証。

## ローカル確認

静的サーバーで配布できますが、実際の再生にはブックマークレットをHTTPSページから使います。

```bash
python3 -m http.server 8000
```

## 重要な制約

- これはブラウザ用プレイヤーで、Navidrome/Subsonicへ登録できる中継URLではありません。
- Radiko側のAPI・配信方式・CORS設定が変わると動かなくなる可能性があります。
- iOS/Safariなど一部環境では、ブックマークレットやポップアップの制約により動作しない場合があります。
- 音声データは利用者のブラウザとRadiko CDN間で直接通信されます。

## 法的注意

非公式の実験用ソフトウェアで、Radikoとは無関係です。利用者自身でRadikoの利用規約、地域制限、放送・著作権、適用法を確認し、許可された範囲でのみ利用してください。

## ライセンス

配布物全体は同梱FAAD2に合わせてGPL-2.0条件で提供します。Rajiko由来の静的データはUnlicenseです。その他の第三者コードを含むため、`vendor/NOTICE.md`と`vendor/source/`も確認してください。
