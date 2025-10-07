# パッケージ公開ガイド

Coding Agent Viewer では 2 つの npm パッケージを配布します。

| パッケージ | 用途 | ディレクトリ |
|------------|------|---------------|
| `@nogataka/coding-agent-viewer-sdk` | ライブラリ / SDK | `packages/sdk` |
| `@nogataka/coding-agent-viewer` | CLI (npx) ランタイム | `packages/cli` |

双方を公開する前に **SDK → CLI** の順でビルドすることを推奨します。CLI は SDK に依存するため、SDK のバージョンが確定してから CLI を発行します。

---

## 1. バージョン更新

1. SDK のバージョンを更新
   ```bash
   vim packages/sdk/package.json        # version フィールドを更新
   ```
2. CLI のバージョンを更新（SDK への依存も同じバージョンに揃える）
   ```bash
   vim packages/cli/package.json        # version / dependencies を更新
   ```

必要であればルートの `package.json` でワークスペースバージョンをタグ管理してください。

---

## 2. ビルドとローカル検証

```bash
# SDK をビルド（ESM / CJS / 型定義が dist/ に生成される）
cd packages/sdk
npm run build

# ルートに戻り CLI ランタイムを再構築
cd ../..
npm run build:cli

# 任意: サンプルで動作確認
cd samples/level1-library
npm install
npm link ../../packages/cli
npm link ../../packages/sdk
npm run ink
```

> `npm link` を使うとローカルビルドした CLI / SDK をサンプルプロジェクトで直接検証できます。

---

## 3. SDK の公開

```bash
cd packages/sdk
npm publish --access public
```

`npm view @nogataka/coding-agent-viewer-sdk versions` などで公開を確認してください。

---

## 4. CLI の公開

SDK が公開されたことを確認したら CLI を発行します。

```bash
cd packages/cli
npm publish --access public
```

CLI パッケージは `dependencies` に `@nogataka/coding-agent-viewer-sdk` を含むため、公開前に正しいバージョンへ更新されているか再確認してください。

---

## 5. GitHub Actions を利用した自動公開

`./.github/workflows/release.yml` はタグ (`v*`) の push または手動トリガーで以下を実行します。

1. 依存関係のインストール (`npm install`)
2. SDK ビルド (`npm run build --workspace packages/sdk`)
3. CLI ビルド (`npm run build:cli`)
4. npm への公開（`NPM_TOKEN` が必要）
5. GitHub Release の作成

タグ名と `package.json` のバージョンが一致することを CI で検証します。自動公開を利用する場合も、**SDK → CLI** の順でバージョンを更新した上でタグを作成してください。

---

## 6. 公開後の確認事項

- サンプル (`samples/level1-library`, `samples/level2-api`) が新しいバージョンで動作するか
- `npm install @nogataka/coding-agent-viewer-sdk` を実行し、以下のインポートが機能するか
  ```ts
  import { ExecutionService } from '@nogataka/coding-agent-viewer-sdk/services/execution';
  import { LogSourceFactory } from '@nogataka/coding-agent-viewer-sdk/services/logs';
  import { setupRoutes } from '@nogataka/coding-agent-viewer-sdk/server/routes';
  ```
- `npx @nogataka/coding-agent-viewer` が最新ランタイムを起動できるか

これらを確認してからリリースノートを作成しましょう。
