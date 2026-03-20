import type { AstNode, LangiumCoreServices, LangiumDocument } from 'langium';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URI } from 'langium';

export async function extractDocument(fileName: string, services: LangiumCoreServices): Promise<LangiumDocument> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(chalk.yellow(`Please choose a file with one of these extensions: ${extensions}.`));
        process.exit(1);
    }

    if (!fs.existsSync(fileName)) {
        console.error(chalk.red(`File ${fileName} does not exist.`));
        process.exit(1);
    }

    // Load all .geoforge files in the same directory for cross-file linking
    const dirPath = path.dirname(path.resolve(fileName));
    const allFiles = fs.readdirSync(dirPath)
        .filter(fileName => extensions.includes(path.extname(fileName)))
        .map(fileName => URI.file(path.join(dirPath, fileName)));

    const documents = await Promise.all(
        allFiles.map(uri => services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri))
    );
  
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });

    const document = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.resolve(fileName)))!;
    
    const validationErrors = (document.diagnostics ?? []).filter(e => e.severity === 1);
    if (validationErrors.length > 0) {
        console.error(chalk.red('There are validation errors:'));
        for (const validationError of validationErrors) {
            console.error(chalk.red(
                `line ${validationError.range.start.line + 1}: ${validationError.message} [${document.textDocument.getText(validationError.range)}]`
            ));
        }
        process.exit(1);
    }

    return document;
}

export async function extractAstNode<T extends AstNode>(fileName: string, services: LangiumCoreServices): Promise<T> {
    return (await extractDocument(fileName, services)).parseResult?.value as T;
}

interface FilePathData {
    destination: string,
    name: string
}

export function extractDestinationAndName(filePath: string, destination: string | undefined): FilePathData {
    const absolute = path.resolve(filePath);
    const baseName = path.basename(absolute, path.extname(absolute));
    return {
        destination: destination ?? path.dirname(absolute),
        name: baseName
    };
}
