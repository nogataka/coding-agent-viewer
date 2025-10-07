# パッケージ公開ガイド

Coding Agent Viewer は 2 つの npm パッケージを提供します。

| パッケージ | 用途 | ディレクトリ |
|------------|------|---------------|
| `@nogataka/coding-agent-viewer-sdk` | SDK / ライブラリ | `packages/sdk` |
| `@nogataka/coding-agent-viewer`     | CLI (npx 実行可能) | `packages/cli` |

どちらも pnpm ワークスペースとして管理されており、CI/CD から自動公開できます。以下はリリース前後に実施すべき手順です。

---

## 1. バージョンとブランチの準備
- `packages/sdk/package.json` と `packages/cli/package.json` の `version` を同じ値に更新します。
- CLI の `dependencies.@nogataka/coding-agent-viewer-sdk` は `workspace:*` のままで構いません。pnpm publish が公開時に実バージョンへ差し替えます。
- 変更をコミットし、`main` ブランチへマージします。

---

## 2. ローカル検証
```bash
pnpm install
pnpm run backend:check
pnpm run frontend:check
pnpm run build:cli
pnpm run --filter @nogataka/coding-agent-viewer-sdk build
```

どちらのパッケージも `dist/` に成果物が生成されることを確認してください。

---

## 3. タグ作成と CI/CD 実行
1. Git タグを付与します。例: `git tag v1.2.3`
2. タグを push (`git push origin v1.2.3`) すると `.github/workflows/release.yml` が起動します。

ワークフローの流れ:
- pnpm install（ワークスペース依存解決）
- SDK / CLI のビルドと成果物検証
- `pnpm publish --filter @nogataka/coding-agent-viewer-sdk` による SDK 公開
- `pnpm publish --filter @nogataka/coding-agent-viewer` による CLI 公開
- GitHub Release の自動作成

`pnpm publish` は `workspace:*` 依存を実際のバージョンへ正規化するため、一般ユーザーの `npm i -g @nogataka/coding-agent-viewer` でもエラーは発生しません。

---

## 4. 公開後の確認
- `npm view @nogataka/coding-agent-viewer-sdk version`
- `npm view @nogataka/coding-agent-viewer version`
- `npm i -g @nogataka/coding-agent-viewer@latest` が成功することを確認
- サンプル (`samples/level1-library`, `samples/level2-api`) で SDK を使った簡単な動作確認を実施

必要に応じて GitHub Release の本文を編集し、変更点を共有してください。
