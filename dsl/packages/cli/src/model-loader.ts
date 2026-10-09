import * as fs from "node:fs";
import * as path from "node:path";
import { createResolver, type LoadedNamespace, type Namespace, type Resolver } from "geoforge-model/model-index";

/** Path of the generated model JSON that a given .geoforge source compiles to, by convention. */
export function modelJsonFileName(geoforgeFileName: string): string {
  return `${geoforgeFileName}.json`;
}

/**
 * Resolver for `rootModelPath`'s model that loads a cross-file Ref's namespace from
 * "<sourceFile>.json", resolved relative to whichever directory the referencing namespace's own
 * Refs are relative to (see geoforge-model/model-index) -- so a chain of Refs across several
 * directories resolves correctly, not just ones alongside `rootModelPath` itself.
 */
export function createFileResolver(rootModelPath: string, root: Namespace): Resolver {
  const rootDir = path.dirname(path.resolve(rootModelPath));
  const cache = new Map<string, LoadedNamespace | undefined>();

  const loadNamespace = (sourceFile: string, fromDir: string): LoadedNamespace | undefined => {
    const jsonPath = path.resolve(fromDir, modelJsonFileName(sourceFile));
    if (cache.has(jsonPath)) {
      return cache.get(jsonPath);
    }
    let loaded: LoadedNamespace | undefined;
    try {
      const namespace = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as Namespace;
      loaded = { namespace, dir: path.dirname(jsonPath) };
    } catch {
      loaded = undefined;
    }
    cache.set(jsonPath, loaded);
    return loaded;
  };

  return createResolver(root, rootDir, loadNamespace);
}
