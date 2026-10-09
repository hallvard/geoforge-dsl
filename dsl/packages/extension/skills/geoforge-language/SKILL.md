---
name: geoforge-language
description: Read and write .geoforge files -- GeoForge's DSL for describing feature/data models (packages, models, types, properties, codelists, tags). Use when the user asks to author, edit, or explain a .geoforge file, or asks what some GeoForge syntax means.
---

# The GeoForge DSL

GeoForge is a small Langium-based DSL for describing geospatial/feature-catalogue-style data
models: packages of types (features, datatypes, codelists, builtins) with typed properties,
inheritance, multiplicity, tags and documentation strings. A `.geoforge` file compiles to a JSON
model, from which other artifacts (PlantUML diagrams, ISO 19110 feature catalogues, Java DTOs,
and any custom target -- see the `geoforge-generator-targets` skill) are generated.

## File structure

Every file declares exactly one namespace, either a `model` (a root, importable by name) or a
`package` (a component of a larger model, also importable by name):

```geoforge
model no.ngu.nadag

import geoforge.lib
import no.ngu.nadag.datatyper

feature GeotekniskUnders {
  ...
}
```

```geoforge
package no.ngu.nadag.datatyper

datatype Id {
  ...
}
```

- The namespace name is a dotted qualified name (`no.ngu.nadag.datatyper`), unrelated to the
  filename -- files that reference each other conventionally live in the same directory (or the
  same project subtree; see the workspace/CLI note below).
- `import <qualified.name>` makes that namespace's types resolvable by their simple name (not just
  fully qualified) within this file. A type can also always be referenced by its full qualified
  name even without an import.
- A namespace, package, or type can carry a documentation string directly before it: a plain
  string literal (`"..."` or `'...'`), on its own line.

## Types

Three kinds of top-level type declaration:

```geoforge
builtin CharacterString
builtin Real(precision=2)          // optional parenthesized parameters

codelist StatusKode {
  Active = "A"
  Inactive = "I"
}

datatype Coordinates {
  x: Real
  y: Real
}

feature Building extends Structure {
  identity id: Id
  geometry footprint: Polygon
  name?: CharacterString
}
```

- `datatype` and `feature` are both "composite types" (properties, optional inheritance);
  `feature` is the one that becomes a top-level class in generated feature catalogues -- a
  `datatype` is inlined wherever it's used as a property type instead.
- `abstract` may prefix `datatype`/`feature` to mark it non-instantiable.
- `extends <TypeName>` -- a feature can only extend a feature, a datatype only a datatype
  (enforced by validation).
- A composite type can nest another composite type declaration directly as a property's type
  (an anonymous/local type used only there).

### Codelists

A codelist enumerates named values, or defers to an external register:

```geoforge
codelist Kommunenummer
  import "https://register.geonorge.no/sosi-kodelister/.../kommunenummer"
  as-dictionary
{
}
```

- `import "<url>"` and `as-dictionary` are both optional and independent. Without them, list the
  values directly: `Name = "value"` (or `"quoted name" = "value"` when the value's identifier
  isn't a valid ID). `as-dictionary` marks the codelist as an open, register-backed vocabulary
  rather than a fixed enumeration ShapeChange/consumers should validate against.

## Properties

```geoforge
"documentation string, directly before the property"
  identity id: Id
  geometry position: Point
  parent owner?: Parcel
  child rooms*: Room
  count: Integer = 0
  tags?: CharacterString[0..5] $SOSI_navn="TAGS"
```

- Optional `kind` keyword before the name: `identity` (the type's ID field), `geometry` (its
  spatial extent), `parent` (a back-reference in a containment relationship), `child` (the
  containment reference itself). Omit it for a plain attribute or association.
- Multiplicity comes right after the name (no keyword needed): `?` (0..1), `*` (0..*), `+` (1..*),
  or `[lower..upper]` / `[lower..]` for anything else. No suffix means exactly 1.
- `= <value>` after the type sets a default value (string, number, date, UUID, or a bare name).
- A property's type is either a named type reference (`Id`, `no.ngu.nadag.datatyper.Id`) or a
  nested inline type declaration.

## Tags

Attach arbitrary key/value metadata to a namespace, type, or property, before or after its body:

```geoforge
feature Foo $alias="F" $SOSI_navn="FOO" {
  bar: CharacterString $required
}
```

`$name=value` sets a value (any literal); `$name` alone (or `+name`/`-name`) is a boolean flag.
Tags can appear both right after the declared name and again after the closing structure --
whichever reads more naturally for that tag.

## Literal values

String (`"..."`/`'...'`), integer, decimal, date (`2024-01-15`), time (`14:30`/`14:30:00.5`),
datetime (date immediately followed by time), UUID, and bare name/identifier values are all valid
wherever a `LiteralValue` is expected (property defaults, tag values, codelist item values).

## Practical notes

- The VS Code extension's language server resolves cross-references across the *entire* opened
  workspace folder (recursively) -- open the folder containing all the files a model spans, and
  go-to-definition/hover/diagnostics work across files automatically.
- The CLI (`dsl-to-model`, `plantuml`, etc.) is more limited by default -- it only looks in the
  entry file's own directory unless told otherwise. See the `geoforge-commands` skill for how
  that's handled from the editor (it's automatic there).
- Every reference resolves either through the current file's own declared types, an `import`ed
  namespace's types by simple name, or any type's fully qualified name -- there's no notion of a
  "default"/unqualified global scope beyond that.
