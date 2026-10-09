import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import type { GeoForgeModel } from 'geoforge-model/model';
import { generatePlantumlFiles } from './plantuml-options.js';

export type ModelToPlantumlOptions = {
  destination?: string;
};

export const modelToPlantumlAction = async (fileName: string, opts: ModelToPlantumlOptions): Promise<void> => {
  const model = await readModelFile(fileName);
  for (const generatedFilePath of generatePlantumlFiles(model, fileName, opts.destination)) {
    console.log(chalk.green(`PlantUML generated to ${generatedFilePath}`));
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
    console.error(chalk.red('Input JSON must be a GeoForge model with elementType="model", name and types.'));
    process.exit(1);
  }

  return parsed;
}

function isGeoForgeModel(value: unknown): value is GeoForgeModel {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { elementType?: unknown; name?: unknown; types?: unknown };
  return candidate.elementType === 'model' && Array.isArray(candidate.name) && Array.isArray(candidate.types);
}
