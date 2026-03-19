import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import type { Model } from "geoforge-language";
import { creategeoforgeServices, isModel } from "geoforge-language";

let services: ReturnType<typeof creategeoforgeServices>;
let parse:    ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;
beforeAll(async () => {
    services = creategeoforgeServices(EmptyFileSystem);
    const doParse = parseHelper<Model>(services.geoforge);
    parse = (input: string) => doParse(input, { validation: true });

    // activate the following if your linking test requires elements from a built-in library, for example
    // await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});


describe('Validating', () => {
  
    test('check no Model errors', async () => {
        document = await parse(`
            model ngu.nadag

            builtin String
            builtin Timestamp
            builtin Posisjon
            builtin Areal

            datatype Id {
              name: String
              namespace: String
              version: Timestamp
            }

            layer GU {
              identity id: Id
              geometry omraade: Areal
              borehull*: layer GB {
                identity id: Id
                geometry posisjon: Posisjon 
              }
            }
        `);

        expect(
            // here we first check for validity of the parsed document object by means of the reusable function
            //  'checkDocumentValid()' to sort out (critical) typos first,
            // and then evaluate the diagnostics by converting them into human readable strings;
            // note that 'toHaveLength()' works for arrays and strings alike ;-)
          checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n') || undefined
        ).toBeUndefined();
    });

      test('reject cross-kind supertype', async () => {
        document = await parse(`
          model ngu.nadag

          datatype BaseData {}
          layer BadLayer extends BaseData {}
        `);

        const errors = (document.diagnostics ?? []).filter(d => d.severity === 1);
        expect(errors.some(d => d.message.includes('cannot extend'))).toBe(true);
      });

      test('allow same-kind supertype', async () => {
        document = await parse(`
          model ngu.nadag

          layer BaseLayer {}
          layer GoodLayer extends BaseLayer {}
        `);

        const errors = (document.diagnostics ?? []).filter(d => d.severity === 1);
        expect(errors).toHaveLength(0);
      });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isModel(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a Model'.`
        || undefined;
}

    function diagnosticToString(d: Diagnostic) {
      return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
    }
