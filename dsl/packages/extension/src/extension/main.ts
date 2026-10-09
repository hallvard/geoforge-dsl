import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import type { JavaGeneratorConfig } from './java-generator-config.js';
import { discoverGeneratorTargets, runGeneratorTarget } from './generator-targets.js';

let client: LanguageClient;
const execFileAsync = promisify(execFile);

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    client = await startLanguageClient(context);

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        const fsPath = editor?.document.uri.fsPath;
        if (fsPath?.endsWith('.puml')) {
            void rememberVisitedPlantuml(context, fsPath);
        }
    }));

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

    const generateCommand = vscode.commands.registerCommand('geoforge.generate', async () => {
        const builtins: GenerateQuickPickItem[] = GENERATE_TARGETS.map(t => ({
            label: t.label,
            run: () => t.run(context)
        }));
        const custom: GenerateQuickPickItem[] = discoverCustomGeneratorTargets().map(target => ({
            label: target.config.label,
            run: () => runGeneratorTarget(target)
        }));

        const picked = await vscode.window.showQuickPick([...builtins, ...custom], { placeHolder: 'Generate...' });
        if (!picked) {
            return;
        }
        await picked.run();
    });

    context.subscriptions.push(modelToDslCommand, generateCommand);
}

interface GenerateQuickPickItem extends vscode.QuickPickItem {
    label: string;
    run(): Promise<void>;
}

interface GenerateTarget {
    label: string;
    run(context: vscode.ExtensionContext): Promise<void>;
}

const GENERATE_TARGETS: GenerateTarget[] = [
    { label: 'PlantUML', run: generatePlantuml },
    { label: 'Feature Catalogue', run: generateFeatureCatalogue },
    { label: 'Java DTOs', run: generateJavaDto }
];

/**
 * Custom targets defined under .geoforge/generators/ (see generator-targets.ts), discovered by
 * walking from the workspace root down to the active editor's own directory -- so a target defined
 * closer to whatever the user is working on overrides a same-named one defined nearer the root.
 */
function discoverCustomGeneratorTargets() {
    const editor = vscode.window.activeTextEditor;
    const referencePath = editor?.document.uri.fsPath;
    const workspaceRoot = referencePath ? getWorkspaceRoot(referencePath) : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const startDir = referencePath ? path.dirname(referencePath) : workspaceRoot;
    if (!startDir) {
        return [];
    }
    return discoverGeneratorTargets(startDir, workspaceRoot);
}

/** A model's PlantUML diagrams are described by "<model>.puml-options.json"; see the cli's plantuml-options. */
const PUML_OPTIONS_SUFFIX = '.puml-options.json';

async function generatePlantuml(context: vscode.ExtensionContext): Promise<void> {
    const filePath = await pickPlantumlSourceFile();
    if (!filePath) {
        return;
    }
    const args = ['plantuml', filePath];
    if (!filePath.endsWith('.geoforge.json')) {
        const workspaceRoot = getWorkspaceRoot(filePath);
        if (workspaceRoot) {
            args.push('--workspace', workspaceRoot);
        }
    }
    const startedAt = Date.now();
    const succeeded = await runGeoforgeCli(args, filePath, context.extensionPath);
    if (succeeded) {
        await openGeneratedPlantuml(context, filePath, startedAt);
    }
}

async function generateFeatureCatalogue(context: vscode.ExtensionContext): Promise<void> {
    const filePath = await pickGeoforgeFile();
    if (!filePath) {
        return;
    }
    const modelFile = await ensureModelJsonFile(filePath, context);
    if (!modelFile) {
        return;
    }
    const succeeded = await runGeoforgeCli(['model2fc', modelFile], modelFile, context.extensionPath);
    if (succeeded) {
        await openGeneratedModelToFeatureCatalogue(modelFile);
    }
}

async function generateJavaDto(context: vscode.ExtensionContext): Promise<void> {
    const filePath = await pickGeoforgeFile();
    if (!filePath) {
        vscode.window.showErrorMessage('Could not determine GeoForge input file. Open a .geoforge or .geoforge.json file or select one.');
        return;
    }
    const modelFile = await ensureModelJsonFile(filePath, context);
    if (!modelFile) {
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
                'no.geoforge.dtogen.GeoForgeDtoGeneratorMain',
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

/**
 * Opens the diagram(s) just generated: "<model>.geoforge.puml" for default options, or one
 * "<model>.<options name>.puml" per *.puml.options.json file (see cli's plantuml-options) -- told
 * apart from stale ones left over from earlier runs by having been written since `startedAt`.
 * They are opened least recently visited first, so the one you were last looking at ends up focused.
 */
async function openGeneratedPlantuml(context: vscode.ExtensionContext, sourceFilePath: string, startedAt: number): Promise<void> {
    const dir = path.dirname(path.resolve(sourceFilePath));
    const stem = getPlantumlModelStem(sourceFilePath);
    const generated = fs.readdirSync(dir)
        .filter(file => file.startsWith(`${stem}.`) && file.endsWith('.puml'))
        .map(file => path.join(dir, file))
        .filter(file => fs.statSync(file).mtimeMs >= startedAt - 1000);
    if (generated.length === 0) {
        const expected = path.join(dir, `${stem}.geoforge.puml`);
        vscode.window.showWarningMessage(`PlantUML generation finished, but no output file was found next to ${expected}`);
        return;
    }
    const visited = context.workspaceState.get<string[]>(VISITED_PLANTUML_KEY, []);
    // Most recently visited last; never visited first, in file name order.
    const rank = (file: string): number => visited.indexOf(file);
    generated.sort((a, b) => rank(a) - rank(b));
    for (const file of generated) {
        await openGeneratedFile(file, `PlantUML generation finished, but output file was not found at ${file}`);
    }
}

const VISITED_PLANTUML_KEY = 'geoforge.visitedPlantuml';
const MAX_VISITED_PLANTUML = 100;

/** Records `fsPath` as the most recently visited diagram, in the workspace state (most recent last). */
async function rememberVisitedPlantuml(context: vscode.ExtensionContext, fsPath: string): Promise<void> {
    const visited = context.workspaceState.get<string[]>(VISITED_PLANTUML_KEY, []).filter(file => file !== fsPath);
    visited.push(fsPath);
    await context.workspaceState.update(VISITED_PLANTUML_KEY, visited.slice(-MAX_VISITED_PLANTUML));
}

/** "nadag" for "nadag.geoforge", "nadag.geoforge.json" and "nadag.puml-options.json". */
function getPlantumlModelStem(sourceFilePath: string): string {
    return path.basename(sourceFilePath)
        .replace(/\.puml-options\.json$/, '')
        .replace(/\.json$/, '')
        .replace(/\.geoforge$/, '');
}

async function openGeneratedModelToDsl(sourceFilePath: string): Promise<void> {
    const generatedPath = getGeneratedModelToDslPath(sourceFilePath);
    await openGeneratedFile(generatedPath, `Model-to-DSL finished, but output file was not found at ${generatedPath}`);
}

async function openGeneratedModelToFeatureCatalogue(sourceFilePath: string): Promise<void> {
    const generatedPath = getGeneratedModelToFeatureCataloguePath(sourceFilePath);
    await openGeneratedFile(generatedPath, `Model-to-feature-catalogue finished, but output file was not found at ${generatedPath}`);
}

async function openGeneratedFile(generatedPath: string, warningMessage: string): Promise<void> {
    if (!fs.existsSync(generatedPath)) {
        vscode.window.showWarningMessage(warningMessage);
        return;
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(generatedPath));
    await vscode.window.showTextDocument(document, { preview: false });
}

/** The model JSON file a .geoforge file compiles to -- always alongside its source. */
function getModelJsonPath(geoforgeFilePath: string): string {
    const absolute = path.resolve(geoforgeFilePath);
    const outputDirectory = path.dirname(absolute);
    const sourceBaseName = path.basename(absolute, path.extname(absolute));
    return path.join(outputDirectory, `${sourceBaseName}.geoforge.json`);
}

function getGeneratedModelToDslPath(sourceFilePath: string): string {
    const absolute = path.resolve(sourceFilePath);
    const outputDirectory = path.dirname(absolute);
    const sourceBaseName = path.basename(absolute, path.extname(absolute));
    return path.join(outputDirectory, `${sourceBaseName}.geoforge`);
}

function getGeneratedModelToFeatureCataloguePath(sourceFilePath: string): string {
    const absolute = path.resolve(sourceFilePath);
    const outputDirectory = path.dirname(absolute);
    const sourceBaseName = path.basename(absolute, path.extname(absolute));
    return path.join(outputDirectory, `${sourceBaseName}.feature_catalogue.json`);
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

/**
 * Picks the .geoforge file the user is working on, or an already-open .geoforge.json if that's
 * what they're actually looking at. Prompts for a .geoforge file (not .json) otherwise, since the
 * model JSON is an implementation detail -- see ensureModelJsonFile.
 */
async function pickGeoforgeFile(): Promise<string | undefined> {
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
            'GeoForge files': ['geoforge']
        },
        openLabel: 'Select GeoForge file'
    });
    return selected?.[0]?.fsPath;
}

/**
 * Ensures `filePath` has an up-to-date model JSON and returns its path -- generating it (and every
 * other .geoforge file it actually references, needed for cross-file references to resolve)
 * transparently if `filePath` is a .geoforge source, or passing it through unchanged if it's
 * already JSON. Searches the whole workspace folder (not just filePath's own directory) for
 * referenced files, since a real VS Code workspace commonly spans several directories.
 */
async function ensureModelJsonFile(filePath: string, context: vscode.ExtensionContext): Promise<string | undefined> {
    if (filePath.endsWith('.geoforge.json')) {
        return filePath;
    }
    const args = ['dsl2model', filePath];
    const workspaceRoot = getWorkspaceRoot(filePath);
    if (workspaceRoot) {
        args.push('--workspace', workspaceRoot);
    }
    const succeeded = await runGeoforgeCli(args, filePath, context.extensionPath);
    if (!succeeded) {
        return undefined;
    }
    const modelPath = getModelJsonPath(filePath);
    if (!fs.existsSync(modelPath)) {
        vscode.window.showErrorMessage(`Model generation finished, but output file was not found at ${modelPath}`);
        return undefined;
    }
    return modelPath;
}

async function pickPlantumlSourceFile(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'geoforge') {
        return editor.document.uri.fsPath;
    }
    if (editor && (editor.document.uri.fsPath.endsWith('.geoforge.json') || editor.document.uri.fsPath.endsWith(PUML_OPTIONS_SUFFIX))) {
        return editor.document.uri.fsPath;
    }

    const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
            'GeoForge sources and PlantUML options': ['geoforge', 'json']
        },
        openLabel: 'Select GeoForge source file'
    });
    return selected?.[0]?.fsPath;
}

/**
 * Picks an existing model JSON file directly -- used by Model To DSL, whose whole purpose is
 * round-tripping FROM a model (possibly one with no corresponding .geoforge source at all, e.g.
 * one produced by the Java ShapeChange pipeline), so it doesn't make sense to derive one here.
 */
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
