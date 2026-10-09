import { GeoForgeModel, GeoForgePackage, GeoForgeType, QName, Ref, nameString } from './model.js';

export type Namespace = GeoForgeModel | GeoForgePackage;

export interface TypeIndex {
  readonly types: readonly GeoForgeType[];
  get(qName: QName): GeoForgeType | undefined;
}

export function createTypeIndex(namespace: Namespace): TypeIndex {
  const byName = new Map<string, GeoForgeType>(namespace.types.map(type => [nameString(type.name), type]));
  return {
    types: namespace.types,
    get: qName => byName.get(nameString(qName))
  };
}

export interface LoadedNamespace {
  namespace: Namespace;
  /**
   * Opaque directory/location context that further Refs found within `namespace` (i.e. their own
   * `sourceFile`) should resolve against -- since `Ref.sourceFile` is relative to whichever
   * document originally declared the Ref, not to whoever ends up loading it.
   */
  dir: string;
}

/** Loads the namespace declared in `sourceFile`, relative to `fromDir`; undefined if unavailable. */
export type NamespaceLoader = (sourceFile: string, fromDir: string) => LoadedNamespace | undefined;

export interface ResolvedType {
  type: GeoForgeType;
  /** Resolver correctly scoped to resolve further Refs found within `type` (e.g. its properties). */
  resolver: Resolver;
}

export interface Resolver {
  resolve(ref: Ref<GeoForgeType>): ResolvedType | undefined;
}

/**
 * Resolves Refs against `root` (whose own Refs are relative to `rootDir`), following
 * `Ref.sourceFile` into other namespaces via `loadNamespace` as needed.
 *
 * A Ref without `sourceFile` means "declared in the same namespace as this Ref" -- which is
 * whichever namespace we most recently resolved into, NOT necessarily `root`: a type loaded from
 * elsewhere can itself have properties with local (sourceFile-less) Refs pointing at sibling types
 * in *that* namespace. Each `resolve()` call therefore returns not just the type but a resolver
 * scoped to it, so a caller recursing into that type's own properties resolves correctly.
 */
export function createResolver(root: Namespace, rootDir: string, loadNamespace?: NamespaceLoader): Resolver {
  function resolverFor(index: TypeIndex, dir: string): Resolver {
    return {
      resolve(ref: Ref<GeoForgeType>): ResolvedType | undefined {
        if (ref.sourceFile === undefined) {
          const type = index.get(ref.qName);
          return type ? { type, resolver: resolverFor(index, dir) } : undefined;
        }
        const loaded = loadNamespace?.(ref.sourceFile, dir);
        if (!loaded) {
          return undefined;
        }
        const loadedIndex = createTypeIndex(loaded.namespace);
        const type = loadedIndex.get(ref.qName);
        return type ? { type, resolver: resolverFor(loadedIndex, loaded.dir) } : undefined;
      }
    };
  }

  return resolverFor(createTypeIndex(root), rootDir);
}
