import { toString } from 'langium/generate';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Model } from 'geoforge-language';
import { creategeoforgeServices } from 'geoforge-language';
import type { GeoForgeModel } from 'geoforge-model/model';
import { generatePlantuml as generatePlantumlFromgeoforgeSpecification } from 'geoforge-model/plantuml-generator';
import { buildModel } from './builder.js';
import { extractAstNode, extractDestinationAndName } from './util.js';

export type PlantumlGenerateOptions = {
    destination?: string;
}

export const generatePlantumlAction = async (fileName: string, opts: PlantumlGenerateOptions): Promise<void> => {
    const services = creategeoforgeServices(NodeFileSystem).geoforge;
    const astModel = await extractAstNode<Model>(fileName, services);
    const geoForgeModel = buildModel(astModel);
    generatePlantuml(geoForgeModel, fileName, opts.destination);
};

export function generatePlantuml(spec: GeoForgeModel, filePath: string, destination: string | undefined): string {
  const data = extractDestinationAndName(filePath, destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}.geoforge.puml`;    

  generatePlantumlFromgeoforgeSpecification(spec, (fileNode) => {
    if (!fs.existsSync(data.destination)) {
      fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
  });
  return generatedFilePath;
}
