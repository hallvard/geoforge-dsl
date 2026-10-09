import type { LangiumDocument } from 'langium';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Namespace } from 'geoforge-language';
import { creategeoforgeServices } from 'geoforge-language';
import { NodeFileSystem } from 'langium/node';
import { isCompositeType, type GeoForgeModel, type GeoForgePackage, type GeoForgeType, type Ref } from 'geoforge-model/model';
import { buildNamespace } from './builder.js';
import { extractWorkspace } from './util.js';
import { modelJsonPathFor, writeModelFile } from './dsl-to-model.js';

export interface CompiledEntry {
  path: string;
  model: GeoForgeModel | GeoForgePackage;
}

/**
 * Compiles `fileName` to model JSON, and does the same for every other .geoforge file it actually
 * references (directly or transitively via a supertype or property type) -- since a downstream
 * generator resolves a cross-file reference by reading that file's own JSON off disk (see
 * geoforge-model/model-index), each one needs an up-to-date JSON on disk too, not just the file
 * being generated from.
 *
 * The traversal follows real references (via the Ref.sourceFile pointers buildNamespace produces),
 * not just files sitting in the same directory -- so it also reaches files elsewhere, as long as
 * `workspaceRoot` is wide enough for them to have been discovered and linked in the first place
 * (see extractWorkspace). Without `workspaceRoot`, only fileName's own directory is searched,
 * matching the previous behavior.
 *
 * `entryDestination` only applies to `fileName`'s own output; every other file compiled along the
 * way is always written alongside its own source -- and only actually rewritten if its source is
 * newer than its existing JSON (a file like a shared builtins package rarely changes, so most runs
 * skip writing it once it's up to date; its Refs are still read from the freshly-built in-memory
 * model to continue the reachability walk either way).
 */
export async function compileDirectory(fileName: string, entryDestination?: string, workspaceRoot?: string): Promise<CompiledEntry> {
  const services = creategeoforgeServices(NodeFileSystem).geoforge;
  const { entryDocument, documents } = await extractWorkspace(fileName, services, workspaceRoot);
  const documentsByPath = new Map(documents.map(doc => [doc.uri.fsPath, doc]));

  const queue: LangiumDocument[] = [entryDocument];
  const queued = new Set<string>([entryDocument.uri.fsPath]);

  let entry: CompiledEntry | undefined;
  while (queue.length > 0) {
    const doc = queue.shift()!;
    const isEntry = doc === entryDocument;
    const namespace = doc.parseResult.value as Namespace;

    let model: GeoForgeModel | GeoForgePackage;
    try {
      model = buildNamespace(namespace);
    } catch (error) {
      if (isEntry) {
        throw error;
      }
      console.warn(`Skipping ${doc.uri.fsPath}: ${(error as Error).message}`);
      continue;
    }

    const destination = isEntry ? entryDestination : undefined;
    const jsonPath = modelJsonPathFor(doc.uri.fsPath, destination);
    const writtenPath = (isEntry || isStale(doc.uri.fsPath, jsonPath))
      ? await writeModelFile(model, doc.uri.fsPath, destination)
      : jsonPath;
    if (isEntry) {
      entry = { path: writtenPath, model };
    }

    for (const sourceFile of collectSourceFiles(model)) {
      const targetPath = path.resolve(path.dirname(doc.uri.fsPath), sourceFile);
      const targetDoc = documentsByPath.get(targetPath);
      if (targetDoc && !queued.has(targetPath)) {
        queued.add(targetPath);
        queue.push(targetDoc);
      }
    }
  }

  if (!entry) {
    throw new Error(`Failed to compile ${fileName}`);
  }
  return entry;
}

/** True if `jsonPath` doesn't exist yet, or `sourcePath` was modified more recently than it. */
function isStale(sourcePath: string, jsonPath: string): boolean {
  try {
    return fs.statSync(sourcePath).mtimeMs > fs.statSync(jsonPath).mtimeMs;
  } catch {
    return true;
  }
}

/** Every distinct Ref.sourceFile referenced by `model`'s own types (its supertypes and property types). */
function collectSourceFiles(model: GeoForgeModel | GeoForgePackage): string[] {
  const sourceFiles = new Set<string>();
  const visit = (ref: Ref<GeoForgeType> | undefined): void => {
    if (ref?.sourceFile) {
      sourceFiles.add(ref.sourceFile);
    }
  };
  for (const type of model.types) {
    if (isCompositeType(type)) {
      visit(type.superType);
      for (const prop of type.properties) {
        visit(prop.type);
      }
    }
  }
  return Array.from(sourceFiles);
}
