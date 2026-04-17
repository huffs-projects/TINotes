# TINotes JSON Format

TINotes supports JSON export/import for notebook backups.

## Current Format (Version 1)

The current payload format is:

```json
{
  "version": 1,
  "meta": {
    "selectedNotebookName": "Algebra",
    "exportedAt": "2026-04-17T00:00:00.000Z"
  },
  "notebooks": {
    "Algebra": {
      "home/Quadratic": {
        "type": "file",
        "position": "home",
        "content": "X^2+BX+C"
      }
    }
  }
}
```

## Field Reference

- `version` (number, required): Import/export schema version. Current value is `1`.
- `meta` (object, optional for import):
  - `selectedNotebookName` (string, optional): The selected notebook at export time.
  - `exportedAt` (string, optional): ISO timestamp generated during export.
- `notebooks` (object, required): Map of notebook names to notebook objects.

Each notebook value is an object keyed by item names. Item names are usually full paths like `home/Folder/File`.

Each item should be an object with at least:

- `type` (string): Usually `file`, `folder`, or `equation`.
- `position` (string): Parent path such as `home` or `home/Folder`.

Optional fields used by specific item types include:

- `content` (string): File content payload.
- `link` (string): Linked item reference path.

## Legacy Import Compatibility

TINotes still accepts legacy payloads that were exported without a wrapper object. Legacy payloads are interpreted as:

```json
{
  "Algebra": {
    "home/Quadratic": {
      "type": "file",
      "position": "home",
      "content": "X^2+BX+C"
    }
  }
}
```

During import, this is normalized to the versioned format using:

- `version: 1`
- `meta.importedFromLegacyFormat: true`
- `notebooks: <legacyObject>`

## Import Rules

Import will fail when:

- top-level payload is not a JSON object
- `version` is not `1`
- `notebooks` is missing or not an object
- any notebook entry is not an object

When notebook or item names conflict with existing data, imported names are renamed with:

- notebook suffix: ` (imported)`, ` (imported 2)`, etc.
- item suffix: ` (imported)`, ` (imported 2)`, etc.

If item references (`position`, `link`) point to renamed imported items, TINotes updates those references to the new names.
