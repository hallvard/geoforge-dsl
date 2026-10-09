import chalk from 'chalk';
import { toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Namespace } from 'geoforge-model/model-index';
import { generatePlantuml, type PlantumlOptions, type PlantumlOptionsFile } from 'geoforge-model/plantuml-generator';
import { createFileResolver } from './model-loader.js';

/** Suffix of the file, alongside the model, describing the model's PlantUML diagrams. */
export const PLANTUML_OPTIONS_SUFFIX = '.puml-options.json';

export function isPlantumlOptionsFile(filePath: string): boolean {
  return filePath.endsWith(PLANTUML_OPTIONS_SUFFIX);
}

/** "dir/nadag.geoforge", "dir/nadag.geoforge.json" and "dir/nadag.puml-options.json" -> "nadag". */
export function modelStem(filePath: string): string {
  return path.basename(filePath)
      .replace(new RegExp(`${PLANTUML_OPTIONS_SUFFIX.replace('.', '\\.')}$`), '')
      .replace(/\.json$/, '')
      .replace(/\.geoforge$/, '');
}

/** The options file for a model (".geoforge" or ".geoforge.json"). */
export function plantumlOptionsPath(modelFilePath: string): string {
  return path.join(path.dirname(path.resolve(modelFilePath)), `${modelStem(modelFilePath)}${PLANTUML_OPTIONS_SUFFIX}`);
}

/** The model source ("<stem>.geoforge", else "<stem>.geoforge.json") that an options file describes diagrams for. */
export function modelPathForOptions(optionsFilePath: string): string {
  const base = path.join(path.dirname(path.resolve(optionsFilePath)), `${modelStem(optionsFilePath)}.geoforge`);
  return fs.existsSync(base) || !fs.existsSync(`${base}.json`) ? base : `${base}.json`;
}

/** The diagrams described for `modelFilePath`; empty if it has no options file. */
export function readPlantumlOptions(modelFilePath: string): PlantumlOptions[] {
  const optionsPath = plantumlOptionsPath(modelFilePath);
  if (!fs.existsSync(optionsPath)) {
    return [];
  }
  let parsed: PlantumlOptionsFile;
  try {
    parsed = JSON.parse(fs.readFileSync(optionsPath, 'utf-8')) as PlantumlOptionsFile;
  } catch (error) {
    console.error(chalk.red(`Invalid JSON in ${optionsPath}: ${(error as Error).message}`));
    process.exit(1);
  }
  const diagrams = Array.isArray(parsed) ? parsed : parsed?.diagrams;
  if (!Array.isArray(diagrams)) {
    console.error(chalk.red(`${optionsPath} must be a list of diagrams, or an object with a "diagrams" list.`));
    process.exit(1);
  }
  return diagrams;
}

/**
 * Generates one PlantUML file "<model>.<diagram name>.puml" per diagram described in the model's
 * options file, or a single "<model>.geoforge.puml" with default options if there is none. Written
 * next to `modelFilePath` unless `destination` is given. Returns the written paths.
 */
export function generatePlantumlFiles(model: Namespace, modelFilePath: string, destination: string | undefined): string[] {
  const outDir = destination ?? path.dirname(path.resolve(modelFilePath));
  fs.mkdirSync(outDir, { recursive: true });
  const resolver = createFileResolver(modelFilePath, model);
  const stem = modelStem(modelFilePath);

  const diagrams = readPlantumlOptions(modelFilePath);
  const runs: { fileName: string; options?: PlantumlOptions }[] = diagrams.length > 0
      ? diagrams.map((options, i) => ({ fileName: `${stem}.${options.name ?? `diagram${i + 1}`}.puml`, options }))
      : [{ fileName: `${stem}.geoforge.puml` }];

  return runs.map(({ fileName, options }) => {
    const outPath = path.join(outDir, fileName);
    generatePlantuml(model, resolver, node => fs.writeFileSync(outPath, toString(node), 'utf-8'), options);
    return outPath;
  });
}
