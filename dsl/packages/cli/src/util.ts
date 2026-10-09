import type { AstNode, LangiumCoreServices, LangiumDocument } from 'langium';
import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URI } from 'langium';

export interface ExtractedWorkspace {
    /** The requested file's document. */
    entryDocument: LangiumDocument;
    /** Every candidate document loaded for cross-file linking (entryDocument included) -- see extractWorkspace's `workspaceRoot` param for scope. */
    documents: LangiumDocument[];
}

/**
 * Loads `fileName` into a Langium workspace so cross-file references link. By default only
 * `fileName`'s own directory is scanned for other .geoforge files (matching the previous
 * behavior); passing `workspaceRoot` scans it recursively instead, via the same
 * `WorkspaceManager.searchFolder` a real VS Code workspace folder is scanned with -- reusing
 * Langium's own traversal and exclusion rules (node_modules, out, dotfiles) rather than
 * reimplementing them, and reaching files in other directories too. The CLI never goes through the
 * LSP `initialize`/`initialized` handshake that triggers this automatically for the language
 * server, but `WorkspaceManager` is just an injected service like any other -- calling its public
 * `searchFolder` method directly works the same without one.
 */
export async function extractWorkspace(fileName: string, services: LangiumCoreServices, workspaceRoot?: string): Promise<ExtractedWorkspace> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(chalk.yellow(`Please choose a file with one of these extensions: ${extensions}.`));
        process.exit(1);
    }

    if (!fs.existsSync(fileName)) {
        console.error(chalk.red(`File ${fileName} does not exist.`));
        process.exit(1);
    }

    const allFiles = workspaceRoot
        ? await services.shared.workspace.WorkspaceManager.searchFolder(URI.file(path.resolve(workspaceRoot)))
        : fs.readdirSync(path.dirname(path.resolve(fileName)))
            .filter(name => extensions.includes(path.extname(name)))
            .map(name => URI.file(path.join(path.dirname(path.resolve(fileName)), name)));

    const documents = await Promise.all(
        allFiles.map(uri => services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri))
    );

    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });

    const entryDocument = services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.resolve(fileName)))!;

    const validationErrors = (entryDocument.diagnostics ?? []).filter(e => e.severity === 1);
    if (validationErrors.length > 0) {
        console.error(chalk.red('There are validation errors:'));
        for (const validationError of validationErrors) {
            console.error(chalk.red(
                `line ${validationError.range.start.line + 1}: ${validationError.message} [${entryDocument.textDocument.getText(validationError.range)}]`
            ));
        }
        process.exit(1);
    }

    return { entryDocument, documents };
}

export async function extractDocument(fileName: string, services: LangiumCoreServices): Promise<LangiumDocument> {
    return (await extractWorkspace(fileName, services)).entryDocument;
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
