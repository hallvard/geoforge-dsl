---
name: geoforge-generator-targets
description: Add a custom generation target to GeoForge's "Generate..." command -- run any external tool (not just the built-in PlantUML/Feature Catalogue/Java DTO generators) from a templated config. Use when the user wants to wire up a new generator, importer, or shell command as a Generate... target.
---

# Adding a custom generator target

GeoForge's **Generate...** command isn't limited to its three built-in targets (PlantUML, Feature
Catalogue, Java DTOs). Any shell command that reads a config/input file can be added as a target
by dropping a JSON file (plus, usually, a template) into a `.geoforge/generators/` folder -- no
extension code change, no rebuild.

## Where target files live

```
<some-directory>/.geoforge/generators/<target-id>.json
```

Discovery walks from the workspace root down to the directory of the file currently open in the
editor, reading every `*.json` in each level's `.geoforge/generators/` folder. **A target defined
closer to the active file overrides one with the same filename (id) defined nearer the root** --
so a subproject can supply its own version of a shared target (a different jar path, a different
template) without touching the root's copy. Put a target near the files it's actually for.

## Target config schema

```json
{
    "label": "Human-readable name shown in the Generate... list",
    "command": "shell command line, after {{variable}} substitution",
    "cwd": "optional working directory for command (default: the directory containing .geoforge/)",
    "input": {
        "prompt": "Select ...",
        "extensions": ["xml", "xmi"]
    },
    "variables": {
        "fixedName": "fixed value, always available for substitution"
    },
    "templates": [
        { "file": "relative/path/to/template.xml", "variable": "config" }
    ]
}
```

- `command` runs through a **real shell** (like an npm script) -- pipes, quoting, `&&` etc. all
  work. All paths (`cwd`, `templates[].file`) are relative to the directory that *contains* the
  `.geoforge` folder this target file lives under, not to the target file itself or the workspace
  root.
- `input` (optional) prompts the user for one file -- reused from the active editor if it already
  matches `extensions`, otherwise a file-open dialog filtered to them. Its value becomes the
  `input` variable.
- `variables` (optional) are fixed values always available, alongside `input` and whatever each
  template binds (below).
- `templates` (optional): each entry's `file` is read, every `{{name}}` in it is replaced with the
  matching variable, and the **rendered result is written to a real temporary file** -- never
  passed as a shell process-substitution pipe (`<(...)`). Many CLI tools (ShapeChange included)
  fail to read those because they try to determine the file's length or seek, which a pipe doesn't
  support. The temp file's path becomes available as the variable named in `variable`, usable in
  `command` or in a later template.
- `{{name}}` placeholders in `command` itself are substituted the same way, after all templates
  have been rendered -- so `command` can reference a template-produced path (`{{config}}`) or a
  variable directly (`{{input}}`).

## Worked example: importing a ShapeChange model

`java-gen/shapechange/.geoforge/generators/nadag-shapechange-import.json`:

```json
{
    "label": "ShapeChange Import (NADAG)",
    "command": "java -jar target/shapechange-1.0-SNAPSHOT.jar -c {{config}}",
    "variables": { "modelName": "nadag" },
    "input": { "prompt": "Select UML/XMI model file", "extensions": ["xml", "xmi"] },
    "templates": [
        { "file": "shapechange-config.template.xml", "variable": "config" }
    ]
}
```

`java-gen/shapechange/shapechange-config.template.xml` (a copy of the tool's real config, with the
input path and model name parameterized):

```xml
<ShapeChangeConfiguration ...>
  <input>
    <parameter name="inputFile" value="{{input}}"/>
    ...
  </input>
  <targets>
    <Target class="no.geoforge.shapechange.ShapechangeToGeoForgeTarget" mode="enabled">
      <targetParameter name="outputFile" value="target/generated/{{modelName}}.geoforge.json" />
      <targetParameter name="modelName" value="{{modelName}}" />
      ...
    </Target>
  </targets>
</ShapeChangeConfiguration>
```

Picking "ShapeChange Import (NADAG)" from **Generate...** prompts for the XMI file, renders the
template to a temp XML config with that path substituted in, and runs ShapeChange against it.

## Checklist for a new target

1. Decide where it belongs (root-level, shared; or nested, project-specific/overriding).
2. Write the template file(s) your tool's config format needs, with `{{...}}` placeholders where
   dynamic values go.
3. Write the target JSON alongside it (or reusing an existing template with different
   `variables`).
4. Reload the Extension Development Host (or just re-run **Generate...** in a running one --
   discovery happens fresh on every invocation, no reload needed unless the extension itself
   changed).
