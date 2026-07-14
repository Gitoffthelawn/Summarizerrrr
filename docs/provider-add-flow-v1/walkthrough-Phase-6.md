# Walkthrough - Phase 6: Delete dead components + i18n

Phase 6 of the `provider-add-flow-v1` plan removes the two components that are no longer imported after the previous phases and adds proper i18n keys for the "Add provider" / "Remove" UI strings across all 8 supported locales.

## Changes Made

### 1. Deleted Components

#### [DELETE] GeminiBasicConfig.svelte
- `src/components/providerConfigs/GeminiBasicConfig.svelte` — the Gemini Basic configuration component. Thinking-level controls were ported into `ProviderKeyConfig.svelte` in Phase 2.

#### [DELETE] ProvidersSelect.svelte
- `src/components/inputs/ProvidersSelect.svelte` — the old provider select dropdown, already unused after the provider-settings restructure.

### 2. i18n — New Keys in All 8 Locales

Added `settings.provider_key_config.add_provider` and `settings.provider_key_config.remove_provider` to:

| Locale | `add_provider` | `remove_provider` |
|--------|---------------|-------------------|
| en | Add provider | Remove |
| vi | Thêm nhà cung cấp | Xóa |
| de | Anbieter hinzufügen | Entfernen |
| es | Añadir proveedor | Eliminar |
| fr | Ajouter un fournisseur | Supprimer |
| ja | プロバイダーを追加 | 削除 |
| ko | 공급자 추가 | 제거 |
| zh-CN | 添加提供商 | 移除 |

#### Modified locale files:
- [en.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/en.json)
- [vi.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/vi.json)
- [de.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/de.json)
- [es.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/es.json)
- [fr.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/fr.json)
- [ja.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ja.json)
- [ko.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/ko.json)
- [zh-CN.json](file:///Users/nguyenle/Documents/GitHub/Summarizerrrr/src/lib/locales/zh-CN.json)

## Verification Results

### 1. Dead Reference Grep

```sh
grep -rn "GeminiBasicConfig\|ProvidersSelect" src/
```

```
(no output — zero hits)
```

### 2. Type Checks

```sh
npm run check
```

```
svelte-check found 0 errors and 20 warnings in 10 files
```

### 3. Chrome Build

```sh
npm run build
```

```
Σ Total size: 12.48 MB
✓ Finished in 22.8 s
```

### 4. Firefox Build

```sh
npm run build:firefox
```

```
Σ Total size: 12.48 MB
✓ Finished in 20.5 s
```

## Verification Categories

### Completed Verification (Verified by Agent)

- [x] `grep -rn "GeminiBasicConfig\|ProvidersSelect" src/` — zero hits (no dead refs)
- [x] `npm run check` — 0 errors
- [x] `npm run build` — succeeds
- [x] `npm run build:firefox` — succeeds

### Still-Required Manual Verification (To Be Done by User)

- [ ] Switch UI language to `vi` and at least one other locale — confirm no raw i18n key IDs appear in the "Add provider" button or "Remove" control in the settings UI
