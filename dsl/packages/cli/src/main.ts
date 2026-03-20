import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { GeoForgeLanguageMetaData } from 'geoforge-language';
import { dslToModelAction } from './dsl-to-model.js';
import { generatePlantumlAction } from './generator.js';
import { modelToDslAction } from './model-to-dsl.js';
import { modelToPlantumlAction } from './model-to-plantuml.js';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

// export const generatePlantumlAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
//     const services = creategeoforgeServices(NodeFileSystem).geoforge;
//     const spec = await extractAstNode<Specification>(fileName, services);
//     const generatedFilePath = generatePlantuml(spec, fileName, opts.destination);
//     console.log(chalk.green(`Plantuml generated to ${generatedFilePath}`));
// };

// export type GenerateOptions = {
//     destination?: string;
// }

type PlantumlCliOptions = {
    destination?: string;
};

async function plantumlSmartAction(fileName: string, opts: PlantumlCliOptions): Promise<void> {
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.json') {
        await modelToPlantumlAction(fileName, opts);
        return;
    }
    await generatePlantumlAction(fileName, opts);
}

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = GeoForgeLanguageMetaData.fileExtensions.join(', ');
    program
        .command('plantuml')
        .argument('<file>', `source file (.json model or possible DSL extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates PlantUML from DSL or GeoForge model JSON based on input file extension')
        .action(plantumlSmartAction);

    program
        .command('dsl-to-model')
        .alias('dsl2model')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('translates a DSL file to GeoForge model JSON')
        .action(dslToModelAction);

    program
        .command('model2dsl')
        .argument('<file>', 'source model file in JSON format')
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('translates a GeoForge model JSON file to DSL text')
        .action(modelToDslAction);

    program.parse(process.argv);
}
