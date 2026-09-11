import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  Association,
  CodeListValue,
  FeatureCatalogue,
  FeatureCatalogueAttribute,
  FeatureCatalogueClass,
  ValueDomain
} from 'geoforge-feature-catalogue/feature-catalogue';
import {
  CodeListItem,
  CodeListType,
  CompositeTypeProperty,
  DataType,
  GeoForgeModel,
  GeoForgePackage,
  GeoForgeType,
  LayerType,
  Multiplicity,
  Ref,
  Tag,
  isDataType,
  isCodeListType,
  isLayerType,
  simpleName
} from 'geoforge-model/model';
import { extractDestinationAndName } from './util.js';

export type ModelToFeatureCatalogueOptions = {
  destination?: string;
};

export const modelToFeatureCatalogueAction = async (fileName: string, opts: ModelToFeatureCatalogueOptions): Promise<void> => {
  const model = await readModelFile(fileName);
  const catalogue = buildFeatureCatalogueFromModel(model);
  const generatedFilePath = await writeCatalogueFile(catalogue, fileName, opts.destination);
  console.log(chalk.green(`Feature catalogue JSON generated to ${generatedFilePath}`));
};

/**
 * Only LayerTypes become top-level classes (a feature catalogue documents feature types, per ISO 19110);
 * DataType/CodeListType/BuiltinType are inlined wherever a LayerType property references them, matching
 * how the format inlines and duplicates such types rather than declaring them independently.
 */
export function buildFeatureCatalogueFromModel(model: GeoForgeModel | GeoForgePackage): FeatureCatalogue {
  return model.types.filter(isLayerType).map(buildClass);
}

function buildClass(layerType: LayerType): FeatureCatalogueClass {
  const attributes: FeatureCatalogueAttribute[] = [];
  const associations: Association[] = [];

  for (const prop of layerType.properties) {
    const propType = prop.type.element;
    if (propType && isLayerType(propType)) {
      associations.push(buildAssociation(prop, propType));
    } else {
      attributes.push(buildAttribute(prop, []));
    }
  }

  return {
    name: simpleName(layerType),
    description: layerType.description,
    attributes,
    abstract: layerType.abstract,
    relationships: {
      inheritance: layerType.superType ? [simpleNameOfRef(layerType.superType)] : [],
      associations
    },
    package: packageOf(layerType.name)
  };
}

function buildAttribute(prop: CompositeTypeProperty, ancestry: readonly DataType[]): FeatureCatalogueAttribute {
  const propType = prop.type.element;

  const attribute: FeatureCatalogueAttribute = {
    name: simpleName(prop),
    type: propType ? simpleName(propType) : simpleNameOfRef(prop.type),
    description: prop.description,
    cardinality: renderCardinality(prop.multiplicity),
    taggedValues: buildTaggedValues(prop.tags)
  };

  if (propType && isDataType(propType)) {
    if (ancestry.includes(propType)) {
      throw new Error(
        `Data type '${simpleName(propType)}' contains itself (directly or indirectly); ` +
        'cannot inline it as repeated catalogue attributes.'
      );
    }
    attribute.attributes = propType.properties.map(nested => buildAttribute(nested, [...ancestry, propType]));
  } else if (propType && isCodeListType(propType)) {
    attribute.valueDomain = buildValueDomain(propType);
  }

  return attribute;
}

function buildAssociation(prop: CompositeTypeProperty, target: LayerType): Association {
  return {
    target: simpleName(target),
    role: simpleName(prop),
    cardinality: renderCardinality(prop.multiplicity)
  };
}

function buildValueDomain(codeListType: CodeListType): ValueDomain {
  const valueDomain: ValueDomain = { kind: 'codelist' };

  if (codeListType.description !== undefined) {
    valueDomain.definition = codeListType.description;
  }

  const codeListTag = codeListType.tags.find(tag => tag.name === 'codeList');
  if (codeListTag && typeof codeListTag.value === 'string') {
    valueDomain.codeList = codeListTag.value;
  }

  const asDictionaryTag = codeListType.tags.find(tag => tag.name === 'asDictionary');
  if (asDictionaryTag) {
    valueDomain.asDictionary = asDictionaryTag.value === true || asDictionaryTag.value === 'true';
  }

  if (codeListType.items.length > 0) {
    valueDomain.listedValues = codeListType.items.map(buildCodeListValue);
  }

  return valueDomain;
}

function buildCodeListValue(item: CodeListItem): CodeListValue {
  const value = item.value ?? simpleName(item);
  return {
    value,
    label: item.description ?? item.title ?? value
  };
}

function buildTaggedValues(tags: Tag[]): Record<string, string> | undefined {
  if (tags.length === 0) {
    return undefined;
  }
  return Object.fromEntries(tags.map(tag => [tag.name, tagValueToString(tag.value)]));
}

function tagValueToString(value: Tag['value']): string {
  if (value === undefined) {
    return 'true';
  }
  return String(value);
}

function renderCardinality(multiplicity: Multiplicity): string {
  if (multiplicity.upper === -1) {
    return `${multiplicity.lower}..*`;
  }
  if (multiplicity.lower === multiplicity.upper) {
    return `${multiplicity.lower}`;
  }
  return `${multiplicity.lower}..${multiplicity.upper}`;
}

function simpleNameOfRef(ref: Ref<GeoForgeType>): string {
  if (ref.element) {
    return simpleName(ref.element);
  }
  return ref.qName[ref.qName.length - 1] ?? 'Unknown';
}

function packageOf(qName: string[]): string {
  return qName.slice(0, -1).join('.');
}

async function readModelFile(fileName: string): Promise<GeoForgeModel | GeoForgePackage> {
  let content: string;
  try {
    content = await fs.readFile(fileName, 'utf-8');
  } catch {
    console.error(chalk.red(`File ${fileName} does not exist.`));
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error(chalk.red(`Invalid JSON in ${fileName}: ${(error as Error).message}`));
    process.exit(1);
  }

  if (!isNamespaceModel(parsed)) {
    console.error(chalk.red('Input JSON must be a GeoForge model/package with elementType, name and types.'));
    process.exit(1);
  }

  return parsed;
}

function isNamespaceModel(value: unknown): value is GeoForgeModel | GeoForgePackage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { elementType?: unknown; name?: unknown; types?: unknown };
  const elementType = candidate.elementType;
  return (
    (elementType === 'model' || elementType === 'package') &&
    Array.isArray(candidate.name) &&
    Array.isArray(candidate.types)
  );
}

async function writeCatalogueFile(catalogue: FeatureCatalogue, sourceFilePath: string, destination?: string): Promise<string> {
  const data = extractDestinationAndName(sourceFilePath, destination);
  const generatedFilePath = path.join(data.destination, `${data.name}.feature_catalogue.json`);

  await fs.mkdir(data.destination, { recursive: true });

  let json: string;
  try {
    json = JSON.stringify(catalogue, null, 2);
  } catch (error) {
    console.error(chalk.red(`Could not serialize feature catalogue: ${(error as Error).message}`));
    process.exit(1);
  }

  await fs.writeFile(generatedFilePath, json, 'utf-8');
  return generatedFilePath;
}
