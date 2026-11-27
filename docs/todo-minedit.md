# TODO — minedit

Stack: Bun + Next.js (App Router) + TypeScript. Java Edition only.

## Phase 1: Kerangka & tampilan Minecraft
- [x] Setup package.json, dependency, tsconfig, next.config
- [x] Design system (`app/globals.css`, font pixel, tekstur tanah buatan sendiri)
- [x] Halaman mode kosong

## Phase 2: CLI, deteksi world, buka folder
- [x] `lib/world/detect.ts`, `state.ts`, `fs.ts`, `auth.ts`
- [x] API `world`, `fs`, `open`
- [x] `cli/minedit.ts` (token, port bebas, `next start`, buka browser)
- [x] `FolderPicker`

## Phase 3: Peta grid chunk
- [x] `lib/world/region.ts` (baca header `.mca`)
- [x] API `chunks`
- [x] `ChunkMap` (pan, zoom, grid, koordinat, tab dimensi)

## Phase 4: Brush penghapus
- [x] `lib/world/backup.ts` + `deleteChunks`
- [x] API `delete`
- [x] `BrushBar` (hotbar, undo, clear, apply + konfirmasi)

## Phase 5: Edit seed
- [x] `lib/world/level.ts`
- [x] API `seed`
- [x] `SeedPanel`

## Phase 6: Install & poles
- [x] `bin`, `bun link`, pesan error ramah
- [x] README
- [x] Test (`bun test`), build (`next build`)
