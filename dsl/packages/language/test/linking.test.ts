import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import type { CompositeType, BuiltinType, Model, TypeDef, Property } from "geoforge-language";
import { creategeoforgeServices, isCompositeType, isBuiltinType, isModel, isTypeRef, isTypeDef, isProperty } from "geoforge-language";
import { fail } from "node:assert";

let services: ReturnType<typeof creategeoforgeServices>;
let parse: ReturnType<typeof parseHelper<Model>>;
let document: LangiumDocument<Model> | undefined;

beforeAll(async () => {
  services = creategeoforgeServices(EmptyFileSystem);
  parse = parseHelper<Model>(services.geoforge);

  // activate the following if your linking test requires elements from a built-in library, for example
  // await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
  document && clearDocuments(services.shared, [document]);
});
describe('Linking tests', () => {

  test('linking of Model', async () => {
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
              geometry "område": Areal
              borehull*: layer GB {
                identity id: Id
                geometry posisjon: Posisjon 
              }
            }
        `);

    expect(
      // here we first check for validity of the parsed document object by means of the reusable function
      //  'checkDocumentValid()' to sort out (critical) typos first,
      // and then evaluate the cross references we're interested in by checking
      //  the referenced AST element as well as for a potential error message;
      checkDocumentValid(document)
    ).toBeUndefined();

    const spec = document.parseResult.value;
    const idType = findType('Id', isCompositeType, spec) as CompositeType;
    const arealType = findType('Areal', isBuiltinType, spec) as BuiltinType;
    const posisjonType = findType('Posisjon', isBuiltinType, spec) as BuiltinType;

    const guType = findType('GU', isCompositeType, spec) as CompositeType;
    const gbType = findTypeDef('GB', isCompositeType, guType) as CompositeType;

    expect(idType).toBeDefined();
    expect(arealType).toBeDefined();
    expect(posisjonType).toBeDefined();
    expect(guType).toBeDefined();
    expect(gbType).toBeDefined();

    checkPropertyWithTypeRef('id', guType, idType);
    checkPropertyWithTypeRef('område', guType, arealType);
    checkPropertyWithTypeRef('posisjon', gbType, posisjonType);
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

function findType(name: string, predicate: (item: any) => boolean, spec: Model): TypeDef | undefined {
  return spec.types.find(type => type.name == name);
}

function checkPropertyWithTypeRef(name: string, type: CompositeType, expectedType: TypeDef): undefined {
  const prop = findProperty(name, type);
  if (!prop) {
    fail(`Expected a ${name} property in ${type.name}`);
  }
  const propType = prop.type
  if (!isTypeRef(propType)) {
    fail(`Expected ${prop?.name} had a TypeRef`);
  }
  expect(propType.typeRef.ref).toBe(expectedType);
}

function findTypeDef(name: string, predicate: (item: any) => boolean, type: CompositeType): TypeDef | undefined {
  for (const prop of type.properties) {
    if (isProperty(prop) && isTypeDef(prop.type) && prop.type.name == name) {
      return prop.type;
    }
  }
  return undefined;
}

function findProperty(name: string, type: CompositeType): Property | undefined {
  const prop = type.properties.find(prop => isProperty(prop) && prop.name == name);
  return (isProperty(prop) ? prop : undefined);
}