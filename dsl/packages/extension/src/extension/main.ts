import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';

let client: LanguageClient;
const execFileAsync = promisify(execFile);

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    client = await startLanguageClient(context);
    
    const generatePlantumlCommand = vscode.commands.registerCommand('geoforge.generatePlantuml', async () => {
        const filePath = await pickGeoforgeFile();
        if (!filePath) {
            return;
        }
        await runGeoforgeCli(['plantuml', filePath], filePath);
    });

    const dslToModelCommand = vscode.commands.registerCommand('geoforge.dslToModel', async () => {
        const filePath = await pickGeoforgeFile();
        if (!filePath) {
            return;
        }
        await runGeoforgeCli(['dsl2model', filePath], filePath);
    });

    const modelToPlantumlCommand = vscode.commands.registerCommand('geoforge.modelToPlantuml', async () => {
        const filePath = await pickModelJsonFile();
        if (!filePath) {
            return;
        }
        await runGeoforgeCli(['model2plantuml', filePath], filePath);
    });

    const modelToJavaCommand = vscode.commands.registerCommand('geoforge.modelToJava', async () => {
        const filePath = await pickModelJsonFile();
        if (!filePath) {
            return;
        }
        await runGeoforgeCli(['model2java', filePath], filePath);
    });

    context.subscriptions.push(generatePlantumlCommand, dslToModelCommand, modelToPlantumlCommand, modelToJavaCommand);
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (client) {
        return client.stop();
    }
    return undefined;
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'geoforge' }]
    };

    // Create the language client and start the client.
    const client = new LanguageClient(
        'geoforge',
        'geoforge',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    await client.start();
    return client;
}

async function runGeoforgeCli(args: string[], sourceFilePath: string): Promise<void> {
    const workspaceRoot = getWorkspaceRoot(sourceFilePath);
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder found for the selected file.');
        return;
    }

    const cliPath = path.join(workspaceRoot, 'packages', 'cli', 'bin', 'cli.js');
    try {
        const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args], {
            cwd: workspaceRoot
        });
        const message = stdout.trim() || 'GeoForge command finished.';
        if (stderr.trim()) {
            vscode.window.showWarningMessage(`${message}\n${stderr.trim()}`);
        } else {
            vscode.window.showInformationMessage(message);
        }
    } catch (error) {
        const err = error as { message?: string; stdout?: string; stderr?: string };
        const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n');
        vscode.window.showErrorMessage(`GeoForge command failed. ${details}`);
    }
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
