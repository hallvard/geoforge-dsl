import chalk from 'chalk';
import type { Namespace } from 'geoforge-model/model-index';
import { compileDirectory } from './model-compiler.js';
import { generatePlantumlFiles } from './plantuml-options.js';

export type PlantumlGenerateOptions = {
    destination?: string;
    workspace?: string;
}

export const generatePlantumlAction = async (fileName: string, opts: PlantumlGenerateOptions): Promise<void> => {
    const { model } = await compileDirectory(fileName, undefined, opts.workspace);
    generatePlantuml(model, fileName, opts.destination);
};

export function generatePlantuml(spec: Namespace, filePath: string, destination: string | undefined): string[] {
  const generated = generatePlantumlFiles(spec, filePath, destination);
  for (const generatedFilePath of generated) {
    console.log(chalk.green(`PlantUML generated to ${generatedFilePath}`));
  }
  return generated;
}
