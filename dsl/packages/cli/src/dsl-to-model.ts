import chalk from 'chalk';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Model } from 'geoforge-language';
import { creategeoforgeServices } from 'geoforge-language';
import { buildModel } from './builder.js';
import { extractAstNode } from './util.js';

export type DslToModelOptions = {
  destination?: string;
};

export const dslToModelAction = async (fileName: string, opts: DslToModelOptions): Promise<void> => {
  const services = creategeoforgeServices(NodeFileSystem).geoforge;
  const astModel = await extractAstNode<Model>(fileName, services);
  const model = buildModel(astModel);
  const generatedFilePath = await writeModelFile(model, fileName, opts.destination);
  console.log(chalk.green(`Model JSON generated to ${generatedFilePath}`));
};

async function writeModelFile(model: object, sourceFilePath: string, destination?: string): Promise<string> {
  const data = extractDestinationAndName(sourceFilePath, destination);
  const generatedFilePath = path.join(data.destination, `${data.name}.geoforge.json`);

  await fs.mkdir(data.destination, { recursive: true });

  let json: string;
  try {
    json = JSON.stringify(model, null, 2);
  } catch (error) {
    console.error(chalk.red(`Could not serialize model: ${(error as Error).message}`));
    process.exit(1);
  }

  await fs.writeFile(generatedFilePath, json, 'utf-8');
  return generatedFilePath;
}

function extractDestinationAndName(filePath: string, destination: string | undefined): { destination: string; name: string } {
  const absolute = path.resolve(filePath);
  return {
    destination: destination ?? path.join(path.dirname(absolute), 'generated'),
    name: path.basename(absolute, path.extname(absolute))
  };
}
