# Adaptive Hunter (Minecraft Bedrock Add-on)

統合版向けの挙動パックです。`/function` コマンドで開始できる「学習型ハンター」を追加します。

## 仕様
- `/function hunter/start` で討伐戦を開始。
- ハンター（Husk）がプレイヤーを追跡。
- 倒されるたびに **レベルアップ** して再スポーン。
- プレイヤーの攻撃傾向（近接/遠距離/炎上）を学習し、次回の装備・耐性を強化。

## コマンド
- 開始: `/function hunter/start`
- 停止: `/function hunter/stop`
- 学習初期化: `/function hunter/reset`

## 導入
1. `BP` フォルダを `com.mojang/behavior_packs/` に配置。
2. ワールドで「実験的機能（Script APIが必要な項目）」を有効化。
3. 該当ビヘイビアパックを有効化して入る。
4. ゲーム内で `/function hunter/start` を実行。

## メモ
- Script API のバージョン互換により、将来の統合版で微調整が必要になる場合があります。
- 装備進化の段階は `BP/scripts/main.js` の `getLoadout` で調整できます。
