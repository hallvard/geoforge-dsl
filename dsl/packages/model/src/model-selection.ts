import { EffectivePropertyKind, GeoForgeType, effectivePropertyKind, isBuiltinType, isCodeListType, isCompositeType, isDataType, isLayerType, name, nameString, simpleName } from './model.js';
import { Namespace, Resolver } from './model-index.js';

/** Kinds of model types, as used by `include-kind` / `exclude-kind`. */
export type TypeKind = 'feature' | 'datatype' | 'codelist' | 'builtin';

/**
 * A way for one type to be related to another, named like the keywords in the language:
 * `extends` -- to the supertype; `parent`, `child`, `relation` -- to the type of a property
 * with that (effective) kind, see {@link effectivePropertyKind}: `parent` is a `container` and
 * `child` a `containment` property. Only properties of feature types are followed: a property of a
 * datatype, codelist or builtin type is an attribute, not a relation to another element.
 */
export type RelationKind = 'extends' | 'parent' | 'child' | 'relation';

/** Property kinds as named in options, i.e. like the keywords in the language; `child` is `containment` and `parent` is `container` in the model. */
export type PropertyKindOption = 'identity' | 'geometry' | 'parent' | 'child' | 'relation';

const PROPERTY_KIND_BY_OPTION: Record<PropertyKindOption, EffectivePropertyKind> = {
  identity: 'id',
  geometry: 'geometry',
  parent: 'container',
  child: 'containment',
  relation: 'relation'
};

/** Whether any of `patterns` matches the name, as used in options, of the property kind `kind`. */
export function matchesPropertyKind(patterns: RegExp[], kind: EffectivePropertyKind): boolean {
  const option = (Object.keys(PROPERTY_KIND_BY_OPTION) as PropertyKindOption[]).find(o => PROPERTY_KIND_BY_OPTION[o] === kind);
  return option !== undefined && patterns.some(p => p.test(option));
}

const RELATION_BY_PROPERTY_KIND: Partial<Record<EffectivePropertyKind, RelationKind>> = {
  container: 'parent',
  containment: 'child',
  relation: 'relation'
};

const ALL_RELATIONS: RelationKind[] = ['extends', 'parent', 'child', 'relation'];

/** Which way to follow a relation: `out` = from the element (to its supertype, to its property types), `in` = towards it (to its subtypes, to the types referring to it). */
export type RelationDirection = 'out' | 'in' | 'both';

/**
 * Selects a subset of a model's types. All patterns are JavaScript regular expressions, matched
 * unanchored (use ^ and $ to anchor) against the dotted qualified name *or* the simple name of a
 * type (`include`/`exclude`), against the dotted qualified name of its package
 * (`include-package`/`exclude-package`), or against its kind (`include-kind`/`exclude-kind`).
 *
 * Semantics, applied in this order:
 * 1. The "positive" set: types matching ALL given `include*` dimensions (a dimension left out
 *    matches everything); every type if no `include*` dimension is given at all -- unless
 *    `include-related` is given, in which case it is empty.
 * 2. Types matching ANY of `exclude-package`, `exclude`, `exclude-kind` are removed.
 * 3. The types found by `include-related` are added (not subject to the excludes in 2).
 * 4. The types found by `exclude-related` are removed.
 */
/** One pattern, or a list of patterns of which any may match. */
export type Patterns = string | string[];

export interface ModelSelection {
  'include-package'?: Patterns;
  'exclude-package'?: Patterns;
  include?: Patterns;
  exclude?: Patterns;
  /** Patterns matched against the kind of the type: feature, datatype, codelist or builtin. */
  'include-kind'?: Patterns;
  'exclude-kind'?: Patterns;
  'include-related'?: RelatedSelection[];
  'exclude-related'?: RelatedSelection[];
}

export interface RelatedSelection {
  /**
   * Pattern(s) selecting the starting element(s); the starting elements are themselves included (or
   * excluded, for `exclude-related`). If left out, the starting elements are the types selected by
   * the `include*`/`exclude*` options (steps 1-2), before any `*-related` is applied.
   */
  name?: Patterns;
  /** Relations to follow; default all. */
  relations?: RelationKind[];
  /** Default both. */
  direction?: RelationDirection;
  /** Number of relation steps to follow from the starting elements; default -1 (unlimited). */
  depth?: number;
}

export interface SelectableType {
  type: GeoForgeType;
  /** Resolver scoped to resolve further Refs found within `type` (its properties, supertype). */
  resolver: Resolver;
}

/** Types keyed by qualified name (dotted), in discovery order. */
export type TypeMap = Map<string, SelectableType>;

export function typeKind(type: GeoForgeType): TypeKind | undefined {
  if (isLayerType(type)) return 'feature';
  if (isDataType(type)) return 'datatype';
  if (isCodeListType(type)) return 'codelist';
  if (isBuiltinType(type)) return 'builtin';
  return undefined;
}

export function packageName(type: GeoForgeType): string {
  return nameString(type.name.slice(0, -1));
}

/**
 * All types declared in `spec` plus those reachable from them (supertypes, property types) via
 * `resolver` -- a cross-file type is not inlined into `spec.types`, so it is pulled in on demand.
 */
export function collectReachableTypes(spec: Namespace, resolver: Resolver): TypeMap {
  const all: TypeMap = new Map();
  const add = (type: GeoForgeType, typeResolver: Resolver): void => {
    const key = name(type);
    if (all.has(key)) {
      return;
    }
    all.set(key, { type, resolver: typeResolver });
    if (isCompositeType(type)) {
      for (const ref of [type.superType, ...type.properties.map(prop => prop.type)]) {
        const resolved = ref && typeResolver.resolve(ref);
        if (resolved) {
          add(resolved.type, resolved.resolver);
        }
      }
    }
  };
  for (const type of spec.types) {
    add(type, resolver);
  }
  return all;
}

export function selectTypes(all: TypeMap, selection: ModelSelection | undefined): TypeMap {
  if (!selection) {
    return all;
  }
  const entries = Array.from(all.entries());

  const includePackage = compile(selection['include-package'], 'include-package');
  const includeName = compile(selection.include, 'include');
  const includeKind = compile(selection['include-kind'], 'include-kind');
  const includeRelated = selection['include-related'] ?? [];
  const hasInclude = includePackage || includeName || includeKind;

  const excludePackage = compile(selection['exclude-package'], 'exclude-package');
  const excludeName = compile(selection.exclude, 'exclude');
  const excludeKind = compile(selection['exclude-kind'], 'exclude-kind');
  const excludeRelated = selection['exclude-related'] ?? [];

  const selected = new Set<string>();
  if (hasInclude || includeRelated.length === 0) {
    for (const [key, { type }] of entries) {
      if ((!includePackage || matchesPackage(includePackage, type))
          && (!includeName || matchesName(includeName, type))
          && (!includeKind || matchesKind(includeKind, typeKind(type)))
          && !(excludePackage && matchesPackage(excludePackage, type))
          && !(excludeName && matchesName(excludeName, type))
          && !(excludeKind && matchesKind(excludeKind, typeKind(type)))) {
        selected.add(key);
      }
    }
  }

  if (includeRelated.length > 0 || excludeRelated.length > 0) {
    const graph = buildRelationGraph(all);
    const base = new Set(selected);
    for (const rel of includeRelated) {
      for (const key of findRelated(all, graph, rel, base, 'include-related')) {
        selected.add(key);
      }
    }
    for (const rel of excludeRelated) {
      for (const key of findRelated(all, graph, rel, base, 'exclude-related')) {
        selected.delete(key);
      }
    }
  }

  return new Map(entries.filter(([key]) => selected.has(key)));
}

/** Compiles `patterns`; undefined when there are none (so "no filter" is distinguishable from "matches nothing"). */
export function compile(patterns: Patterns | undefined, optionName: string): RegExp[] | undefined {
  if (patterns === undefined) {
    return undefined;
  }
  return (Array.isArray(patterns) ? patterns : [patterns]).map(pattern => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      throw new Error(`Invalid regular expression "${pattern}" in "${optionName}": ${(error as Error).message}`);
    }
  });
}

export function matchesKind(patterns: RegExp[], kind: string | undefined): boolean {
  return kind !== undefined && patterns.some(p => p.test(kind));
}

function matchesPackage(patterns: RegExp[], type: GeoForgeType): boolean {
  const pkg = packageName(type);
  return patterns.some(p => p.test(pkg));
}

function matchesName(patterns: RegExp[], type: GeoForgeType): boolean {
  const qualified = name(type);
  const simple = simpleName(type);
  return patterns.some(p => p.test(qualified) || p.test(simple));
}

/** Matches `value` against `patterns`, with undefined `patterns` meaning "no constraint". */
export function matchesAny(patterns: RegExp[] | undefined, value: string): boolean {
  return patterns === undefined || patterns.some(p => p.test(value));
}

interface RelationGraph {
  /** key -> neighbours, by relation kind and direction. */
  out: Record<RelationKind, Map<string, Set<string>>>;
  in: Record<RelationKind, Map<string, Set<string>>>;
}

function emptyEdges(): Record<RelationKind, Map<string, Set<string>>> {
  return { extends: new Map(), parent: new Map(), child: new Map(), relation: new Map() };
}

function buildRelationGraph(all: TypeMap): RelationGraph {
  const graph: RelationGraph = {
    out: emptyEdges(),
    in: emptyEdges()
  };
  const link = (kind: RelationKind, from: string, to: string): void => {
    if (!all.has(to) || from === to) {
      return;
    }
    for (const [side, a, b] of [['out', from, to], ['in', to, from]] as const) {
      const neighbours = graph[side][kind].get(a) ?? new Set<string>();
      neighbours.add(b);
      graph[side][kind].set(a, neighbours);
    }
  };
  for (const [key, { type, resolver }] of all) {
    if (!isCompositeType(type)) {
      continue;
    }
    const superType = type.superType && resolver.resolve(type.superType)?.type;
    if (superType) {
      link('extends', key, name(superType));
    }
    for (const prop of type.properties) {
      const target = resolver.resolve(prop.type)?.type;
      const relation = RELATION_BY_PROPERTY_KIND[effectivePropertyKind(prop, target)];
      if (isLayerType(target) && relation) {
        link(relation, key, name(target));
      }
    }
  }
  return graph;
}

function findRelated(all: TypeMap, graph: RelationGraph, rel: RelatedSelection, base: ReadonlySet<string>, optionName: string): Set<string> {
  const patterns = compile(rel.name, `${optionName}.name`);
  const relations = rel.relations ?? ALL_RELATIONS;
  const direction = rel.direction ?? 'both';
  const sides: ('out' | 'in')[] = direction === 'both' ? ['out', 'in'] : [direction];
  const maxDepth = rel.depth ?? -1;

  const found = new Set<string>();
  let frontier: string[] = [];
  for (const [key, { type }] of all) {
    if (patterns ? matchesName(patterns, type) : base.has(key)) {
      found.add(key);
      frontier.push(key);
    }
  }
  for (let depth = 0; frontier.length > 0 && (maxDepth < 0 || depth < maxDepth); depth++) {
    const next: string[] = [];
    for (const key of frontier) {
      for (const side of sides) {
        for (const kind of relations) {
          for (const neighbour of graph[side][kind].get(key) ?? []) {
            if (!found.has(neighbour)) {
              found.add(neighbour);
              next.push(neighbour);
            }
          }
        }
      }
    }
    frontier = next;
  }
  return found;
}
