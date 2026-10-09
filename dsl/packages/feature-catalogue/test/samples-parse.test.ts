import { describe, test, expect } from "vitest";
import { NodeFileSystem } from "langium/node";
import { creategeoforgeServices } from "geoforge-language";
import { URI, type LangiumDocument } from "langium";
import fs from "node:fs";
import path from "node:path";

/**
 * Every .geoforge file in this package is a hand-written fixture that's expected to transform
 * into its matching *.json feature catalogue sample. This test only checks that they still
 * parse and link (including cross-file imports, e.g. planleggingigangsatt imports
 * Fellesegenskaper) -- it's a drift alarm: if a grammar change breaks one of these fixtures,
 * this fails immediately instead of the breakage being discovered later by hand.
 *
 * It intentionally does not check the model2dsl/feature-catalogue transformation output itself,
 * since that output is expected to evolve; parsing validity is the stable invariant.
 */

const DIR = path.resolve(__dirname, '..');

function collectDiagnostics(doc: LangiumDocument): string[] {
    const messages: string[] = [];
    for (const e of doc.parseResult.lexerErrors) {
        messages.push(`lexer: ${e.message}`);
    }
    for (const e of doc.parseResult.parserErrors) {
        messages.push(`parser: ${e.message}`);
    }
    for (const d of doc.diagnostics ?? []) {
        if (d.severity === 1) {
            messages.push(`[${d.range.start.line + 1}:${d.range.start.character}] ${d.message}`);
        }
    }
    return messages;
}

describe('feature-catalogue sample fixtures', () => {
    const files = fs.readdirSync(DIR).filter(f => f.endsWith('.geoforge'));

    test('at least one .geoforge fixture is present', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    test('all .geoforge fixtures parse and link with no errors', async () => {
        const services = creategeoforgeServices(NodeFileSystem);
        const docs: LangiumDocument[] = [];
        for (const file of files) {
            const uri = URI.file(path.resolve(DIR, file));
            const doc = await services.shared.workspace.LangiumDocumentFactory.fromUri(uri);
            services.shared.workspace.LangiumDocuments.addDocument(doc);
            docs.push(doc);
        }
        await services.shared.workspace.DocumentBuilder.build(docs, { validation: true });

        const failures = new Map<string, string[]>();
        for (const doc of docs) {
            const messages = collectDiagnostics(doc);
            if (messages.length > 0) {
                failures.set(path.basename(doc.uri.fsPath), messages);
            }
        }

        if (failures.size > 0) {
            const report = Array.from(failures.entries())
                .map(([file, messages]) => `${file}:\n  ${messages.join('\n  ')}`)
                .join('\n\n');
            throw new Error(`Parse/link errors in feature-catalogue fixtures:\n\n${report}`);
        }
    });
});
