import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import type { JavaGeneratorConfig } from './java-generator-config.js';

let client: LanguageClient;
const execFileAsync = promisify(execFile);

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    client = await startLanguageClient(context);

    const generatePlantumlCommand = vscode.commands.registerCommand('geoforge.generatePlantuml', async () => {
        const filePath = await pickPlantumlSourceFile();
        if (!filePath) {
            return;
        }
        const succeeded = await runGeoforgeCli(['plantuml', filePath], filePath, context.extensionPath);
        if (succeeded) {
            await openGeneratedPlantuml(filePath);
        }
    });

    const dslToModelCommand = vscode.commands.registerCommand('geoforge.dslToModel', async () => {
        const filePath = await pickGeoforgeFile();
        if (!filePath) {
            return;
        }
        const succeeded = await runGeoforgeCli(['dsl2model', filePath], filePath, context.extensionPath);
        if (succeeded) {
            await openGeneratedDslToModel(filePath);
        }
    });

    const modelToDslCommand = vscode.commands.registerCommand('geoforge.modelToDsl', async () => {
        const filePath = await pickModelJsonFile();
        if (!filePath) {
            return;
        }
        const succeeded = await runGeoforgeCli(['model2dsl', filePath], filePath, context.extensionPath);
        if (succeeded) {
            await openGeneratedModelToDsl(filePath);
        }
    });

    const runJavaDtoGeneratorCommand = vscode.commands.registerCommand('geoforge.runJavaDtoGenerator', async () => {
        const modelFile = await pickModelJsonFile();
        if (!modelFile) {
            vscode.window.showErrorMessage('Could not determine model JSON input file. Open a .geoforge.json file or select one.');
            return;
        }

        const { jarPath, attemptedPaths } = resolveJavaDtoGeneratorRuntime(modelFile, context.extensionPath);
        if (!jarPath) {
            vscode.window.showErrorMessage(
                `Java DTO generator jar not found. Tried: ${attemptedPaths.join(', ')}. Build it with mvn package in java-gen/java-dto-generator.`
            );
            return;
        }

        const workspaceRoot = getWorkspaceRoot(modelFile) ?? path.dirname(modelFile);
        const configPath = await ensureJavaGeneratorConfigFile(workspaceRoot);
        if (!configPath) {
            vscode.window.showErrorMessage('Java generator config file not found. Create geoforge-java-generator.json in workspace root.');
            return;
        }

        await runJavaDtoGeneratorMain(jarPath, modelFile, configPath);
    });

    context.subscriptions.push(generatePlantumlCommand, dslToModelCommand, modelToDslCommand, runJavaDtoGeneratorCommand);
}

export function deactivate(): Thenable<void> | undefined {
    if (client) {
        return client.stop();
    }
    return undefined;
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'geoforge' }]
    };

    const languageClient = new LanguageClient('geoforge', 'geoforge', serverOptions, clientOptions);
    await languageClient.start();
    return languageClient;
}

async function runGeoforgeCli(args: string[], sourceFilePath: string, extensionPath: string): Promise<boolean> {
    const { cliPath, attemptedPaths } = resolveCliPath(sourceFilePath, extensionPath);
    if (!cliPath) {
        vscode.window.showErrorMessage(`GeoForge CLI not found. Tried: ${attemptedPaths.join(', ')}`);
        return false;
    }

    try {
        const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
            cwd: path.dirname(cliPath)
        });
        const message = stdout.trim() || 'GeoForge command finished.';
        if (stderr.trim()) {
            vscode.window.showWarningMessage(`${message}\n${stderr.trim()}`);
        } else {
            vscode.window.showInformationMessage(message);
        }
        return true;
    } catch (error) {
        const err = error as { message?: string; stdout?: string; stderr?: string };
        const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n');
        vscode.window.showErrorMessage(`GeoForge command failed. ${details}`);
        return false;
    }
}

async function runJavaDtoGeneratorMain(
    jarPath: string,
    modelFile: string,
    configPath: string
): Promise<boolean> {
    try {
        const classpath = [jarPath, path.join(path.dirname(jarPath), 'libs', '*')].join(path.delimiter);
        const { stdout, stderr } = await execFileAsync(
            'java',
            [
                '-cp',
                classpath,
                'no.ngu.nadag.innmelding.dtogen.GeoForgeDtoGeneratorMain',
                modelFile,
                configPath
            ],
            {
                cwd: path.dirname(modelFile)
            }
        );

        const { outputDirectory, basePackage } = await resolveJavaDtoOutputOptions(configPath);
        const details = [`Input file: ${modelFile}`, `Output folder: ${outputDirectory}`, `Base package: ${basePackage}`].join('\n');
        const message = stdout.trim() || `Java DTO generator finished.\n${details}`;

        if (stderr.trim()) {
            vscode.window.showWarningMessage(`${message}\n${stderr.trim()}`);
        } else {
            vscode.window.showInformationMessage(message);
        }
        return true;
    } catch (error) {
        const err = error as { message?: string; stdout?: string; stderr?: string };
        const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n');
        vscode.window.showErrorMessage(`Java DTO generator failed. ${details}`);
        return false;
    }
}

async function ensureJavaGeneratorConfigFile(workspaceRoot: string): Promise<string | undefined> {
    const candidates = [
        path.join(workspaceRoot, 'geoforge-java-generator.json'),
        path.join(workspaceRoot, '.geoforge-java-generator.json'),
        path.join(workspaceRoot, '.vscode', 'geoforge-java-generator.json')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return undefined;
}

async function resolveJavaDtoOutputOptions(configPath: string): Promise<{ outputDirectory: string; basePackage: string }> {
    const content = await fsp.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as JavaGeneratorConfig;
    const configDir = path.dirname(configPath);

    const outputDirectory = parsed.destinationFolder
        ? path.resolve(configDir, parsed.destinationFolder)
        : path.resolve(configDir, 'generated-sources');
    const basePackage = parsed.packagePrefix && parsed.packagePrefix.trim().length > 0
        ? parsed.packagePrefix.trim()
        : 'no.ngu.generated';

    return { outputDirectory, basePackage };
}

async function openGeneratedPlantuml(sourceFilePath: string): Promise<void> {
    const generatedPath = getGeneratedPlantumlPath(sourceFilePath);
    await openGeneratedFile(generatedPath, `PlantUML generation finished, but output file was not found at ${generatedPath}`);
}

async function openGeneratedDslToModel(sourceFilePath: string): Promise<void> {
    const generatedPath = getGeneratedDslToModelPath(sourceFilePath);
    await openGeneratedFile(generatedPath, `DSL-to-model finished, but output file was not found at ${generatedPath}`);
}

async function openGeneratedModelToDsl(sourceFilePath: string): Promise<void> {
    const generatedPath = getGeneratedModelToDslPath(sourceFilePath);
    await openGeneratedFile(generatedPath, `Model-to-DSL finished, but output file was not found at ${generatedPath}`);
}

async function openGeneratedFile(generatedPath: string, warningMessage: string): Promise<void> {
    if (!fs.existsSync(generatedPath)) {
        vscode.window.showWarningMessage(warningMessage);
        return;
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(generatedPath));
    await vscode.window.showTextDocument(document, { preview: false });
}

function getGeneratedPlantumlPath(sourceFilePath: string): string {
    const absolute = path.resolve(sourceFilePath);
    const outputDirectory = path.dirname(absolute);
    const sourceBaseName = path.basename(absolute, path.extname(absolute));
    const outputBaseName = sourceBaseName.endsWith('.geoforge') ? sourceBaseName : `${sourceBaseName}.geoforge`;
    return path.join(outputDirectory, `${outputBaseName}.puml`);
}

function getGeneratedDslToModelPath(sourceFilePath: string): string {
    const absolute = path.resolve(sourceFilePath);
    const outputDirectory = path.join(path.dirname(absolute), 'generated');
    const sourceBaseName = path.basename(absolute, path.extname(absolute));
    return path.join(outputDirectory, `${sourceBaseName}.geoforge.json`);
}

function getGeneratedModelToDslPath(sourceFilePath: string): string {
    const absolute = path.resolve(sourceFilePath);
    const outputDirectory = path.join(path.dirname(absolute), 'generated');
    const sourceBaseName = path.basename(absolute, path.extname(absolute));
    return path.join(outputDirectory, `${sourceBaseName}.geoforge`);
}

function resolveCliPath(sourceFilePath: string, extensionPath: string): { cliPath?: string; attemptedPaths: string[] } {
    const attemptedPaths: string[] = [];
    const candidates = new Set<string>();

    candidates.add(path.resolve(extensionPath, '..', 'cli', 'bin', 'cli.js'));
    candidates.add(path.resolve(extensionPath, 'node_modules', 'geoforge-cli', 'bin', 'cli.js'));

    const workspaceRoot = getWorkspaceRoot(sourceFilePath);
    if (workspaceRoot) {
        candidates.add(path.resolve(workspaceRoot, 'packages', 'cli', 'bin', 'cli.js'));
        candidates.add(path.resolve(workspaceRoot, 'dsl', 'packages', 'cli', 'bin', 'cli.js'));
    }

    for (const candidate of candidates) {
        attemptedPaths.push(candidate);
        if (fs.existsSync(candidate)) {
            return { cliPath: candidate, attemptedPaths };
        }
    }

    return { attemptedPaths };
}

function resolveJavaDtoGeneratorRuntime(sourceFilePath: string, extensionPath: string): { jarPath?: string; attemptedPaths: string[] } {
    const attemptedPaths: string[] = [];
    const runtimeCandidates: string[] = [];

    runtimeCandidates.push(path.resolve(extensionPath, 'resources', 'java-dto-generator', 'java-dto-generator.jar'));

    const workspaceRoot = getWorkspaceRoot(sourceFilePath);
    if (workspaceRoot) {
        const targetRoots = [
            path.resolve(workspaceRoot, 'java-gen', 'java-dto-generator', 'target'),
            path.resolve(workspaceRoot, '..', 'java-gen', 'java-dto-generator', 'target'),
            path.resolve(workspaceRoot, 'dsl', '..', 'java-gen', 'java-dto-generator', 'target')
        ];

        for (const targetRoot of targetRoots) {
            const jar = findLatestJavaDtoGeneratorJar(targetRoot);
            if (jar) {
                runtimeCandidates.push(jar);
            } else {
                attemptedPaths.push(path.join(targetRoot, 'java-dto-generator-*.jar'));
            }
        }
    }

    for (const candidate of runtimeCandidates) {
        attemptedPaths.push(candidate);
        if (fs.existsSync(candidate)) {
            return { jarPath: candidate, attemptedPaths };
        }
    }

    return { attemptedPaths };
}

function findLatestJavaDtoGeneratorJar(targetDir: string): string | undefined {
    if (!fs.existsSync(targetDir)) {
        return undefined;
    }

    const jarFiles = fs.readdirSync(targetDir)
        .filter(name => /^java-dto-generator-.*\.jar$/.test(name))
        .map(name => path.join(targetDir, name))
        .filter(filePath => fs.statSync(filePath).isFile())
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

    return jarFiles[0];
}

function getWorkspaceRoot(filePath: string): string | undefined {
    const uri = vscode.Uri.file(filePath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        return workspaceFolder.uri.fsPath;
    }
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function pickGeoforgeFile(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'geoforge') {
        return editor.document.uri.fsPath;
    }

    const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
            'GeoForge files': ['geoforge']
        },
        openLabel: 'Select GeoForge file'
    });
    return selected?.[0]?.fsPath;
}

async function pickPlantumlSourceFile(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'geoforge') {
        return editor.document.uri.fsPath;
    }
    if (editor && editor.document.uri.fsPath.endsWith('.geoforge.json')) {
        return editor.document.uri.fsPath;
    }

    const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
            'GeoForge sources': ['geoforge', 'json']
        },
        openLabel: 'Select GeoForge source file'
    });
    return selected?.[0]?.fsPath;
}

async function pickModelJsonFile(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.fsPath.endsWith('.geoforge.json')) {
        return editor.document.uri.fsPath;
    }

    const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
            'GeoForge model files': ['json']
        },
        openLabel: 'Select GeoForge model JSON'
    });
    return selected?.[0]?.fsPath;
}
