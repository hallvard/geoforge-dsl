import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Model } from "geoforge-language";
import { creategeoforgeServices, isModel } from "geoforge-language";
import type { Diagnostic } from "vscode-languageserver-types";

let services: ReturnType<typeof creategeoforgeServices>;
let parse:    ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
    services = creategeoforgeServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.geoforge);

    // activate the following if your linking test requires elements from a built-in library, for example
    // await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Parsing tests', () => {

    test('parse Model', async () => {
        document = await parse(`
            model "Datamodell for NADAG"
            ngu.nadag
            $version=1.0

            builtin "Native String" string as java java.lang.String
            builtin long as java long

            builtin Posisjon as java geo.Geometry
            builtin Areal as java geo.Geometry
            builtin DateTime as java java.time.LocalDateTime
            builtin Date as java java.time.LocalDate
            builtin UUID as java java.util.UUID

            codelist Kode {
                UKJENT = 0
                AKTIV = 1
                INAKTIV = 2
            }

            datatype
                "Identifikasjon"
                Id
                $version=1.0 $versionDate=2025-01-01 $versionTime=12:40:02.007
            {
                "Unik innen navnerom"
                lokalId: UUID // velger likevel UUID

                "Gjør navnet unikt"
                namespace: string
                "Versjonen er monotont økende, f.eks. et tidsstempel"
                version: long
            }

            abstract layer Entitet {
              identity id: Id
              opprettetDato: DateTime
              sistEndretDato: DateTime
            }

            abstract layer StedfestetEntitet extends Entitet {
              geometry posisjon: Posisjon
            }

            layer GU extends Entitet {
              geometry "område" "Område": Areal
              status: Kode
              borehull*: layer GB extends StedfestetEntitet {
                undersoekelser*: layer GBU extends StedfestetEntitet {
                }
              }
            }
        `);

        expect(
            // here we first check for validity of the parsed document object by means of the reusable function
            //  'checkDocumentValid()' to sort out (critical) typos first,
            // and then evaluate the diagnostics by converting them into human readable strings;
            // note that 'toHaveLength()' works for arrays and strings alike ;-)
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toBeUndefined();

        expect(document.parseResult.value?.name).toBe('ngu.nadag');
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
