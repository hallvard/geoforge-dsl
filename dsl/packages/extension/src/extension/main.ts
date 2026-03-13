import * as path from 'node:path';
import { generatePlantumlAction } from 'geoforge-cli/generator';
import * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';

let client: LanguageClient;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    client = await startLanguageClient(context);
    
    // Register PlantUML generation command
    const generatePlantumlCommand = vscode.commands.registerCommand('geoforge.generatePlantuml', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'geoforge') {
            vscode.window.showErrorMessage('Please open a .geoforge file');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        const destination = workspaceFolder?.uri.fsPath;
                
        try {
            await generatePlantumlAction(filePath, { destination });
            vscode.window.showInformationMessage(`PlantUML generated to ${destination}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate PlantUML: ${error}`);
        }
    });
    
    context.subscriptions.push(generatePlantumlCommand);
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
