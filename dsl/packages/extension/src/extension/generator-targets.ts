import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

export interface GeneratorTargetInput {
    prompt: string;
    extensions: string[];
}

export interface GeneratorTargetTemplate {
    /** Path to the template file, relative to the directory containing this target's .geoforge folder. */
    file: string;
    /** Name this template's rendered-and-written-to-disk path is bound to for {{...}} substitution elsewhere (e.g. in `command`). */
    variable: string;
}

export interface GeneratorTargetConfig {
    label: string;
    /** Shell command to run, after {{variable}} substitution. Runs through a real shell, like an npm script would. */
    command: string;
    /** Working directory for `command`, relative to the directory containing this target's .geoforge folder. Defaults to that directory. */
    cwd?: string;
    /** Prompts the user for one file path (or uses the active editor if it matches), bound to the "input" variable. */
    input?: GeneratorTargetInput;
    /** Fixed variable values, always available for substitution alongside "input" and any templates' own variables. */
    variables?: Record<string, string>;
    /** Template files rendered (with {{variable}} substitution) to a real temp file before `command` runs -- not a process-substitution pipe, since tools like ShapeChange can't read those (no seekable length). */
    templates?: GeneratorTargetTemplate[];
}

export interface DiscoveredGeneratorTarget {
    id: string;
    baseDir: string;
    config: GeneratorTargetConfig;
}

/**
 * Discovers custom generator targets by walking from `workspaceRoot` down to `startDir` (both
 * inclusive), reading every *.json file in each level's .geoforge/generators/ folder. A target
 * defined closer to `startDir` overrides one with the same filename (id) defined nearer the root,
 * so a subproject can supply its own version of a target without editing the root's.
 */
export function discoverGeneratorTargets(startDir: string, workspaceRoot: string | undefined): DiscoveredGeneratorTarget[] {
    const byId = new Map<string, DiscoveredGeneratorTarget>();

    for (const dir of directoryChain(startDir, workspaceRoot)) {
        const generatorsDir = path.join(dir, '.geoforge', 'generators');
        let entries: string[];
        try {
            entries = fs.readdirSync(generatorsDir).filter(name => name.endsWith('.json'));
        } catch {
            continue;
        }
        for (const entry of entries) {
            const id = path.basename(entry, '.json');
            const configPath = path.join(generatorsDir, entry);
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as GeneratorTargetConfig;
                byId.set(id, { id, baseDir: dir, config });
            } catch (error) {
                console.error(`Failed to load generator target ${configPath}: ${(error as Error).message}`);
            }
        }
    }

    return Array.from(byId.values());
}

/** Directories from `workspaceRoot` down to `startDir`, inclusive of both -- outermost (root) first, so later entries override earlier ones when merged. */
function directoryChain(startDir: string, workspaceRoot: string | undefined): string[] {
    const start = path.resolve(startDir);
    if (!workspaceRoot) {
        return [start];
    }
    const root = path.resolve(workspaceRoot);
    const relative = path.relative(root, start);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        // startDir isn't under workspaceRoot -- nothing to chain, just look in startDir itself.
        return [start];
    }
    const segments = relative === '' ? [] : relative.split(path.sep);
    const chain = [root];
    let current = root;
    for (const segment of segments) {
        current = path.join(current, segment);
        chain.push(current);
    }
    return chain;
}

/** Replaces every {{name}} in `text` with `variables[name]`, leaving unknown placeholders untouched. */
function substitute(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
    );
}

export async function runGeneratorTarget(target: DiscoveredGeneratorTarget): Promise<void> {
    const { config, baseDir } = target;
    const variables: Record<string, string> = { ...config.variables };

    if (config.input) {
        const inputPath = await pickInputFile(config.input);
        if (!inputPath) {
            return;
        }
        variables.input = inputPath;
    }

    const tempFiles: string[] = [];
    try {
        for (const template of config.templates ?? []) {
            const templatePath = path.resolve(baseDir, template.file);
            const templateText = await fsp.readFile(templatePath, 'utf-8');
            const rendered = substitute(templateText, variables);
            const tempPath = path.join(os.tmpdir(), `geoforge-${target.id}-${template.variable}-${Date.now()}${path.extname(template.file)}`);
            await fsp.writeFile(tempPath, rendered, 'utf-8');
            tempFiles.push(tempPath);
            variables[template.variable] = tempPath;
        }

        const command = substitute(config.command, variables);
        const cwd = path.resolve(baseDir, config.cwd ?? '.');

        try {
            const { stdout, stderr } = await execAsync(command, { cwd, maxBuffer: 16 * 1024 * 1024 });
            const message = stdout.trim() || `${config.label} finished.`;
            if (stderr.trim()) {
                vscode.window.showWarningMessage(`${message}\n${stderr.trim()}`);
            } else {
                vscode.window.showInformationMessage(message);
            }
        } catch (error) {
            const err = error as { message?: string; stdout?: string; stderr?: string };
            const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n');
            vscode.window.showErrorMessage(`${config.label} failed. ${details}`);
        }
    } finally {
        await Promise.all(tempFiles.map(file => fsp.rm(file, { force: true })));
    }
}

async function pickInputFile(input: GeneratorTargetInput): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const ext = path.extname(editor.document.uri.fsPath).slice(1);
        if (input.extensions.includes(ext)) {
            return editor.document.uri.fsPath;
        }
    }
    const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { [input.prompt]: input.extensions },
        openLabel: input.prompt
    });
    return selected?.[0]?.fsPath;
}
