# Z2WAV 設計書 v1.4（Web配信対応版）

---

## 1. 概要

本仕様は、任意ファイルをWAV形式に変換し、制限環境でも安全に転送・保存する可逆フォーマットを定義する。

本版では以下を追加する：

- Webアプリ（GitHub Pages等）での配信前提
- ブラウザ環境別の実装制約
- iOS制約に対応した自動パートサイズ調整

---

## 2. 用語定義

| 用語 | 説明 |
|---|---|
| Z2WAV | 本フォーマット |
| FULL HEADER | 先頭パートのみの完全メタ |
| PART HEADER | 各パートの識別ヘッダ |
| CRC32 | 誤り検出 |
| SHA-256 | 完全一致検証 |

---

## 3. データ配置構造

### 3.1 WAV内部構造

```text
[RIFF/RF64 HEADER]
[fmt]
[data]
  ├─ PART HEADER
  ├─ FULL HEADER（先頭パートのみ）
  ├─ CHUNK群
  └─ INDEX（最終パートのみ）
```

---

### 3.2 先頭パートの構造

```text
data:
  PART HEADER（64B）
  FULL HEADER（72B）
  CHUNK...
```

---

### 3.3 中間パート

```text
data:
  PART HEADER（64B）
  CHUNK...
```

---

### 3.4 最終パート

```text
data:
  PART HEADER（64B）
  CHUNK...
  INDEX
```

---

## 4. PART HEADER仕様

| オフセット | サイズ | 内容 |
|---|---:|---|
| 0 | 6 | “Z2WAVP” |
| 6 | 2 | version |
| 8 | 4 | part_index |
| 12 | 4 | part_total |
| 16 | 8 | global_offset |
| 24 | 8 | part_size |
| 32 | 32 | part_SHA256 |

---

### 4.1 part_SHA256定義

対象データ：

```text
PART HEADERのpart_SHA256フィールドを0埋めした状態 +
その後に続くdata全体
```

👉 自己参照を回避

---

## 5. FULL HEADER仕様

| オフセット | サイズ | 内容 |
|---|---:|---|
| 0 | 6 | “Z2WAV1” |
| 6 | 2 | version |
| 8 | 8 | ZIPサイズ |
| 16 | 8 | チャンク数 |
| 24 | 32 | 全体SHA-256 |
| 56 | 8 | INDEX位置（global offset） |
| 64 | 8 | フラグ |

---

## 6. ZIPストリーム仕様

### 6.1 圧縮方式

- ZIP64
- DEFLATE / STORED

### 6.2 復元ポイント

```text
各Z2WAVチャンク境界で Z_FULL_FLUSH を実行
```

### 6.3 動作

- 各チャンクは独立解凍可能
- CRC不一致チャンクは破棄
- 次チャンク先頭から解凍再開可能

### 6.4 制限

- 破棄チャンク内のZIPエントリは復元不能

---

## 7. CHUNK仕様

```text
uint32 id
uint32 size
byte data[size]
uint32 crc32
```

### 7.1 サイズ制約

- uint32上限：4GB
- 運用制限：最大4MB

### 7.2 4MB制限の理由

メモリ効率・CRC検証粒度・部分復元精度・I/O効率のバランス

---

## 8. INDEX仕様

```text
uint32 entry_count

repeat:
  uint32 chunk_id
  uint64 offset
  uint32 size
```

---

## 9. エラー処理

### 9.1 STOREDモード

| 状態 | 挙動 |
|---|---|
| CRC不一致 | 該当範囲ゼロ埋め |
| 後続 | 継続可能 |

### 9.2 DEFLATEDモード

| 状態 | 挙動 |
|---|---|
| CRC不一致 | チャンク破棄 |
| 後続 | 次チャンクから解凍再開 |

### 9.3 再エンコード検出

- SHA不一致
- CRC広範囲不一致

👉 即エラー停止

---

## 10. 分割仕様

- INDEXは最終パート末尾に配置
- PART HEADERのpart_index/part_totalで順序管理
- ファイル名非依存

---

## 11. 再エンコードリスク

サンプリング変更・正規化・圧縮変換が発生した場合、データは復元不可能。

---

## 12. 安全警告（必須）

### 12.1 リスク

- ランダムノイズ生成
- 最大振幅出力

### 12.2 特に危険

ヘッドホン / イヤホン使用時
👉 聴覚損傷リスクが高い

### 12.3 UI必須表示

- 「再生非推奨」
- 「大音量注意（特にイヤホン）」

---

## 13. 実装要件

- ストリーミング処理必須
- チャンク1〜4MB
- CRC逐次
- SHA並列

---

## 14. Web配信仕様（新規）

### 14.1 配信形態

本アプリはGitHub Pages等の**静的ホスティングで配信可能**。

- サーバ処理不要
- 変換処理は全てクライアントサイド（JS / WASM）
- ユーザのファイルは外部送信されない（プライバシー保護）

### 14.2 技術スタック

| 機能 | 実装 |
|---|---|
| ZIP圧縮 | fflate / pako（Z_FULL_FLUSH対応） |
| SHA-256 | Web Crypto API（crypto.subtle.digest） |
| CRC32 | 自前実装 or ライブラリ |
| WAVヘッダ | DataViewで直接生成 |
| ファイル入力 | File API / Drag & Drop |
| ファイル出力 | File System Access API or Blob |

### 14.3 出力方式

#### 14.3.1 ストリーミング出力（推奨）

```text
showSaveFilePicker()
  → FileSystemWritableFileStream
```

- 大容量対応（GB単位可）
- メモリ使用量低
- 設計書のストリーミング要件と整合

**対応ブラウザ：** Chromium系デスクトップ（Chrome / Edge / Opera）

#### 14.3.2 Blob一括出力（フォールバック）

```text
Blob → URL.createObjectURL → <a download>
```

- 全ブラウザ対応
- メモリ上限に依存
- 数百MBで不安定化リスク

#### 14.3.3 StreamSaver.js方式

Service Worker経由の疑似ストリーミング

- Firefox等で利用可能
- iOS非対応

### 14.4 ブラウザ別対応状況

| 環境 | ストリーミング | 実用上限 |
|---|---|---|
| Chrome / Edge（Desktop） | ✅ File System Access API | GB級 |
| Firefox（Desktop） | △ StreamSaver.js | 数GB |
| Safari（macOS） | ✗ Blob一括 | 〜1GB程度 |
| **iOS Safari** | ✗ Blob一括 | **〜数百MB** |
| **iOS Chrome** | ✗ Blob一括（WebKit強制） | **〜数百MB** |
| **iOS 全ブラウザ** | ✗ | **〜数百MB** |

### 14.5 iOS制約（重要）

#### 14.5.1 背景

AppleのApp Store規約により、iOS上の全ブラウザ（Chrome / Firefox / Edge含む）は**WebKitエンジンの使用が強制**されている。

👉 iOS上ではブラウザを変えても制約は同じ

※ EU圏では2024年のDMA対応で他エンジンが許可される動きがあるが、グローバル展開では前提にしない。

#### 14.5.2 制約内容

- File System Access API 非対応
- ストリーミング書き出し不可
- Blob一括方式のみ
- メモリ上限が厳しい（数百MB程度で不安定化）

#### 14.5.3 対応方針

**iOS検出時は自動的にパートサイズを制限する。**

| 環境 | 推奨パートサイズ |
|---|---|
| Desktop（ストリーミング可） | 制限なし（〜数GB） |
| Desktop（Blob方式） | 512MB |
| **iOS** | **256MB** |

- 1ファイルあたりのサイズを256MB以下に自動分割
- 設計書10章の分割仕様を活用
- ユーザは複数の小さなWAVを順次ダウンロード

### 14.6 PWA化（オプション）

- manifest.json + Service Workerで対応可能
- オフライン動作可能
- iOSでもホーム画面追加で擬似ネイティブ化
- ただしiOSのPWAはストレージ制限あり

### 14.7 セキュリティ

- GitHub Pages標準でHTTPS提供
- File System Access APIはHTTPS必須 → 条件満たす
- クライアント完結のためデータ漏洩リスク低

---

## 15. UI要件

### 15.1 必須

- 進捗表示
- 再生危険警告
- 環境検出表示（iOS時の制約通知）

### 15.2 推奨

- 検証モード
- ファイル情報表示
- ダウンロード方式の自動選択

---

## 16. まとめ

本仕様は：

- WAVによる高互換性
- ZIPによる完全保存
- CRCによる破損検出と部分復元
- Webアプリとしての配信可能性

を組み合わせたデータ輸送方式である。

ただし：

👉 再エンコード耐性は無い  
👉 音声再生は危険  
👉 iOSでは実用上数百MB制限

---

## 17. 今後拡張

- パリティチャンク（ECC / Reed-Solomon）
- 分散保存
- 高耐障害モード
- WebAssembly版（Rust → wasm-pack）
- iOS向けネイティブアプリ（WebKit制約回避）
