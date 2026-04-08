# Z2WAV Web Encoder (MVP)

`Z2WAV_設計書_v1.4_Web配信対応版.md` をもとにした、静的ホスティング可能なブラウザ実装です。

## 使い方

1. `index.html` をブラウザで開く
2. 入力ファイルを選択
3. パートサイズを設定（iOSは256MB推奨）
4. 「Z2WAVに変換」を押す

## 実装済み

- PART HEADER / FULL HEADER / CHUNK / INDEX 生成
- CRC32 / SHA-256 計算
- WAVラップ出力
- 環境検出（iOS / File System Access API）
- 進捗と危険表示

## 注意

本MVPは仕様の基本構造に焦点を当てています。
ZIP64 + DEFLATE + Z_FULL_FLUSH による完全準拠ストリームは未実装です。
