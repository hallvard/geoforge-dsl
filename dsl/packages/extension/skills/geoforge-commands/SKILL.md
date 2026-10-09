---
name: geoforge-commands
description: Generate output (PlantUML, feature catalogue, Java DTOs, or a custom target) from a .geoforge file, or use the underlying geoforge CLI. Use when the user wants to run a generator, asks what commands are available, or wants to script generation from a terminal.
---

# GeoForge commands

## From the editor

Everything starts from the **geoforge: Generate...** command (command palette or a keybinding).
It shows a quick-pick of targets:

- **PlantUML** -- a `.puml` class diagram of the model.
- **Feature Catalogue** -- an ISO 19110-shaped feature catalogue JSON.
- **Java DTOs** -- generates Java data-transfer-object classes via a bundled generator jar; needs
  a `geoforge-java-generator.json` config in the workspace root (or `.vscode/`) with a
  `destinationFolder` and `packagePrefix`.
- Any custom target discovered under a `.geoforge/generators/` folder -- see the
  `geoforge-generator-targets` skill for how those are defined and added.

For every target except plain PlantUML-on-JSON, the model JSON (`<name>.geoforge.json`) the
target actually reads is **generated transparently first** -- you never need to run a separate
"compile" step, and you never pick a `.json` file by hand unless one's already open. This also
regenerates every other `.geoforge` file the entry file actually references (not just files in
the same folder -- the whole opened workspace folder is searched for anything genuinely linked
to), so cross-file references always resolve. Files whose source hasn't changed since their JSON
was last written are left alone (an unrelated shared package doesn't get rewritten every run).

**geoforge: Model To DSL** is the reverse direction: pick (or have open) a model `.geoforge.json`
and get back readable `.geoforge` source -- useful for a model produced by something other than
hand-written DSL (e.g. the ShapeChange import pipeline) that you want to inspect or start editing.

## From a terminal (the `geoforge` CLI)

```sh
geoforge dsl-to-model <file.geoforge> [-d <dir>] [-w <workspaceDir>]
geoforge plantuml <file.geoforge|file.geoforge.json> [-d <dir>] [-w <workspaceDir>]
geoforge model2dsl <file.geoforge.json> [-d <dir>]
geoforge model2fc <file.geoforge.json> [-d <dir>]
```

- `-d, --destination <dir>` -- where to write the requested output; defaults to alongside the
  source file.
- `-w, --workspace <dir>` -- for `dsl-to-model`/`plantuml` only: search this directory
  *recursively* for other `.geoforge` files the entry file references, instead of just its own
  directory (the default). Needed when the files a model spans live in different directories --
  without it, a reference to a file outside the entry's own folder won't resolve. This is what the
  editor commands set automatically to the real workspace root; from a bare terminal you have to
  pass it yourself if your project spans more than one directory.
- Both `dsl-to-model` and `plantuml` also generate every other file the entry actually references
  (not just the entry itself), skipping ones whose JSON is already newer than their source --
  same behavior as the editor commands, since it's the same underlying mechanism.
