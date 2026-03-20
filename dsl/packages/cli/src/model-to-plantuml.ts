import chalk from 'chalk';
import { toString } from 'langium/generate';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GeoForgeModel } from 'geoforge-model/model';
import { generatePlantuml } from 'geoforge-model/plantuml-generator';

export type ModelToPlantumlOptions = {
  destination?: string;
};

export const modelToPlantumlAction = async (fileName: string, opts: ModelToPlantumlOptions): Promise<void> => {
  const model = await readModelFile(fileName);
  const generatedFilePath = await writePlantumlFile(model, fileName, opts.destination);
  console.log(chalk.green(`PlantUML generated to ${generatedFilePath}`));
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

async function writePlantumlFile(model: GeoForgeModel, sourceFilePath: string, destination?: string): Promise<string> {
  const data = extractDestinationAndName(sourceFilePath, destination);
  const outputBaseName = data.name.endsWith('.geoforge') ? data.name : `${data.name}.geoforge`;
  const generatedFilePath = path.join(data.destination, `${outputBaseName}.puml`);

  await fs.mkdir(data.destination, { recursive: true });

  generatePlantuml(model, (fileNode) => {
    fsSync.writeFileSync(generatedFilePath, toString(fileNode), 'utf-8');
  });

  return generatedFilePath;
}

function extractDestinationAndName(filePath: string, destination: string | undefined): { destination: string; name: string } {
  const absolute = path.resolve(filePath);
  return {
    destination: destination ?? path.dirname(absolute),
    name: path.basename(absolute, path.extname(absolute))
  };
}
