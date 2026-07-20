# waiting-display-demo

イベントブースでの整理券運営を支援する Web アプリです。紙の整理券の代わりに **NTAG**（NFCタグ）を配布し、NFCリーダー（PC/SC対応、例: Sony RC-S300）にかざすことで発行・受付・チェックイン状況の表示を行います。

## 主な機能

- **時間枠マスタ管理** (`/slots`): 参加時間の枠（例: 14:00〜14:30）と定員を登録・編集します。
- **発行 / 登録** (`/issue`): 整理番号・受付名・時間枠を入力し、NTAGにかざして NDEF（Text レコード）として書き込みます。NFCリーダーが無い場合の手動発行にも対応しています。
- **受付 / チェックイン** (`/checkin`): 当日、NTAGをかざして NDEF を読み取り、整理番号を照合してチェックインします。二重チェックインや未登録タグも判定します。
- **ディスプレイ** (`/display`): 会場モニタ向けに、時間枠ごとの発行数/定員の充足率とチェックイン状況をリアルタイム表示します。

## 技術スタック

- [Next.js 16](https://nextjs.org/)（App Router） / React 19 / TypeScript
- Tailwind CSS v4
- [SWR](https://swr.vercel.app/)（クライアント側のポーリング取得）
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)（整理券データの永続化）
- [nfc-pcsc](https://github.com/pokusew/nfc-pcsc)（PC/SC対応 USB NFCリーダーとの通信）

## セットアップ

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。

### NFCリーダーについて

`nfc-pcsc` / `better-sqlite3` はネイティブアドオンです。USB接続の PC/SC 対応 NFCリーダー（例: Sony RC-S300, ACR122 など）を接続したローカルPC上での実行を想定しています。リーダーが接続されていない環境でも、各画面の「手動」入力機能を使えば動作を確認できます。

整理券データは `data/waiting.db`（SQLite, WALモード）に保存されます。このディレクトリは `.gitignore` 対象です。

## ライセンス

[MIT License](./LICENSE)
