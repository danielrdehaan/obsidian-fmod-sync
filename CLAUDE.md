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

**Single-file architecture**: All code lives in `main.ts` (~1,850 lines).

### Key Classes

- **FMODSyncPlugin**: Main plugin class - handles settings, ribbon icon, commands, sync orchestration
- **FMODSyncSettingTab**: Settings UI - project cards, FMOD installation management, file/folder pickers
- **ProjectPickerModal**: Fuzzy search for project selection during multi-project sync
- **FolderPickerModal**: Fuzzy search for vault folder selection

### Core Data Flow

1. FMOD Studio exports JSON via companion script (timestamped files)
2. Plugin reads JSON, scans existing vault notes by GUID
3. For each event: create/update/move markdown note
4. Preserves user-added sections during sync updates

### Key Interfaces

- `FMODExportData`: Root export structure (events, project metadata, timestamps)
- `FMODEvent`: Individual event with guid, path, banks, parameters, properties
- `FMODProjectConfig`: Per-project settings (JSON path, output folder, metadata)
- `FMODInstallation`: FMOD Studio installation (path, detected version)

### Important Patterns

- **GUID tracking**: Events matched by unique GUID, not filename - enables renames/moves
- **Frontmatter preservation**: YAML frontmatter parsed, user properties kept separate from FMOD-managed
- **User section preservation**: Custom markdown sections preserved during re-sync
- **30-second polling**: Auto-detects newer exports in same directory
- **Cross-platform**: macOS (.app bundle) and Windows (.exe) version detection

### Electron Integration

Uses `require("electron")` for:
- Native file/folder picker dialogs
- Spawning FMOD Studio processes
- Shell operations (reveal in finder, open URLs)

## File Structure

- `main.ts` - All plugin code
- `styles.css` - Plugin UI styling
- `manifest.json` - Obsidian plugin metadata
- `esbuild.config.mjs` - Build configuration (ESM-compatible CJS output)
