import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { compileDirectory } from './model-compiler.js';

export type DslToModelOptions = {
  destination?: string;
  workspace?: string;
};

export const dslToModelAction = async (fileName: string, opts: DslToModelOptions): Promise<void> => {
  const { path: generatedFilePath } = await compileDirectory(fileName, opts.destination, opts.workspace);
  console.log(chalk.green(`Model JSON generated to ${generatedFilePath}`));
};

export function modelJsonPathFor(sourceFilePath: string, destination?: string): string {
  const data = extractDestinationAndName(sourceFilePath, destination);
  return path.join(data.destination, `${data.name}.geoforge.json`);
}

export async function writeModelFile(model: object, sourceFilePath: string, destination?: string): Promise<string> {
  const generatedFilePath = modelJsonPathFor(sourceFilePath, destination);

  await fs.mkdir(path.dirname(generatedFilePath), { recursive: true });

  let json: string;
  try {
    // `Ref.element` is a resolved back-reference to the target AST node, kept for in-process
    // convenience; it isn't part of the JSON model schema (only `qName` is) and including it
    // would walk into cyclic structures (e.g. a property referencing its own containing type).
    json = JSON.stringify(model, (key, value) => key === 'element' ? undefined : value, 2);
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
    destination: destination ?? path.dirname(absolute),
    name: path.basename(absolute, path.extname(absolute))
  };
}
