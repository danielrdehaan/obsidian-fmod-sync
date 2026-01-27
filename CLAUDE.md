# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian plugin that imports FMOD Studio event data into markdown notes. Enables game audio designers to document FMOD events within their Obsidian vault with GUID-based tracking, folder mirroring, and multi-project support.

## Build Commands

```bash
npm install      # Install dependencies
npm run dev      # Development mode with watch
npm run build    # Production build (outputs main.js)
```

After building, copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/fmod-sync/`.

## Architecture

**Modular architecture**: Code is organized into focused modules under `src/`.

### File Structure

```
main.ts                    # Plugin entry point (~150 lines)
src/
├── types.ts               # All TypeScript interfaces
├── constants.ts           # FMOD_ICON_SVG, DEFAULT_SETTINGS, URLs
├── companion.ts           # Script detection and installation
├── utils/
│   ├── platform.ts        # detectFmodVersion, getFmodScriptsFolder
│   ├── filename.ts        # sanitizeFilename, parseExportFilename
│   └── validation.ts      # JSON schema validation
├── sync/
│   ├── engine.ts          # SyncEngine - orchestrates sync with mutex
│   ├── json-reader.ts     # readJsonFile, findNewerExport
│   └── processor.ts       # processEvent, scanExistingNotes
├── markdown/
│   ├── generator.ts       # generateMarkdown
│   └── frontmatter.ts     # parseFrontmatter, yamlEscape, extractUserSections
└── ui/
    ├── modals.ts          # ProjectPickerModal, FolderPickerModal
    └── settings.ts        # FMODSyncSettingTab
```

### Key Classes

- **FMODSyncPlugin** (`main.ts`): Plugin entry point - settings, ribbon icon, commands
- **FMODSyncSettingTab** (`src/ui/settings.ts`): Settings UI - project cards, FMOD installations
- **ProjectPickerModal** (`src/ui/modals.ts`): Fuzzy search for project selection
- **FolderPickerModal** (`src/ui/modals.ts`): Fuzzy search for vault folder selection

### Core Data Flow

1. FMOD Studio exports JSON via companion script (timestamped files)
2. Plugin reads JSON, validates structure (`src/utils/validation.ts`)
3. Scans existing vault notes by GUID (`src/sync/processor.ts`)
4. For each event: create/update/move markdown note
5. Preserves user-added sections during sync updates

### Key Interfaces (src/types.ts)

- `FMODExportData`: Root export structure (events, project metadata, timestamps)
- `FMODEvent`: Individual event with guid, path, banks, parameters, properties
- `FMODProjectConfig`: Per-project settings (JSON path, output folder, metadata)
- `FMODInstallation`: FMOD Studio installation (path, detected version)
- `SyncProgress`: Progress reporting during sync (phase, current, total)
- `SkipReason`: Tracks skipped events with reasons for logging

### Important Patterns

- **GUID tracking**: Events matched by unique GUID, not filename - enables renames/moves
- **Sync mutex**: Prevents concurrent syncs via `isSyncing` flag
- **JSON validation**: Validates export structure before processing
- **Progress callbacks**: Reports sync progress (scanning, processing events)
- **Skip logging**: Logs skipped events with reasons to console
- **Frontmatter preservation**: YAML frontmatter parsed, user properties kept separate
- **User section preservation**: Custom markdown sections preserved during re-sync
- **30-second polling**: Auto-detects newer exports in same directory
- **Filename length limit**: Truncates filenames over 200 characters
- **Cross-platform**: macOS (.app bundle) and Windows (.exe) version detection
- **PowerShell security**: Sanitizes paths using single quotes for Windows commands

### Electron Integration

Uses `require("electron")` for:
- Native file/folder picker dialogs
- Spawning FMOD Studio processes
- Shell operations (reveal in finder, open URLs)

## Other Files

- `styles.css` - Plugin UI styling
- `manifest.json` - Obsidian plugin metadata
- `esbuild.config.mjs` - Build configuration (bundles all modules into main.js)
- `tsconfig.json` - TypeScript configuration (includes main.ts and src/**)
