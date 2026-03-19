import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GeoForgeModel } from 'geoforge-model/model';
import { generateJavaSources } from 'geoforge-model/java-generator';

export type ModelToJavaOptions = {
  destination?: string;
};

export const modelToJavaAction = async (fileName: string, opts: ModelToJavaOptions): Promise<void> => {
  const model = await readModelFile(fileName);
  const generatedPaths = await writeJavaFiles(model, fileName, opts.destination);
  console.log(chalk.green(`Generated ${generatedPaths.length} Java files.`));
  for (const generatedPath of generatedPaths) {
    console.log(generatedPath);
  }
};

async function readModelFile(fileName: string): Promise<GeoForgeModel> {
  let content: string;
  try {
    content = await fs.readFile(fileName, 'utf-8');
  } catch {
    console.error(chalk.red(`File ${fileName} does not exist.`));
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error(chalk.red(`Invalid JSON in ${fileName}: ${(error as Error).message}`));
    process.exit(1);
  }

  if (!isGeoForgeModel(parsed)) {
    console.error(chalk.red('Input JSON must be a GeoForge model with entityType="model", name and types.'));
    process.exit(1);
  }

  return parsed;
}

function isGeoForgeModel(value: unknown): value is GeoForgeModel {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { entityType?: unknown; name?: unknown; types?: unknown };
  return candidate.entityType === 'model' && Array.isArray(candidate.name) && Array.isArray(candidate.types);
}

async function writeJavaFiles(model: GeoForgeModel, sourceFilePath: string, destination?: string): Promise<string[]> {
  const absolute = path.resolve(sourceFilePath);
  const destinationRoot = destination ?? path.join(path.dirname(absolute), 'generated');

  const generated = generateJavaSources(model);
  const written: string[] = [];

  for (const file of generated) {
    const fullPath = path.join(destinationRoot, file.relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf-8');
    written.push(fullPath);
  }

  return written;
}
