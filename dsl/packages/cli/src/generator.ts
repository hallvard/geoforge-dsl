import { toString } from 'langium/generate';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Model } from 'geoforge-language';
import { creategeoforgeServices } from 'geoforge-language';
import { buildModel } from './builder.js';
import { generatePlantuml as generatePlantumlFromgeoforgeSpecification } from './plantuml-generator.js';
import { extractAstNode, extractDestinationAndName } from './util.js';

export type PlantumlGenerateOptions = {
    destination?: string;
}

export const generatePlantumlAction = async (fileName: string, opts: PlantumlGenerateOptions): Promise<void> => {
    const services = creategeoforgeServices(NodeFileSystem).geoforge;
    const spec = await extractAstNode<Model>(fileName, services);
    generatePlantuml(spec, fileName, opts.destination);
};

export function generatePlantuml(spec: Model, filePath: string, destination: string | undefined): string {
  const geoforgeSpec = buildModel(spec); // ensure that all types are built before generating UML
  console.dir(geoforgeSpec, { depth: 6 });
  
  const data = extractDestinationAndName(filePath, destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}.puml`;    

  generatePlantumlFromgeoforgeSpecification(geoforgeSpec, (fileNode) => {
    if (!fs.existsSync(data.destination)) {
      fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
  });
  return generatedFilePath;
}
