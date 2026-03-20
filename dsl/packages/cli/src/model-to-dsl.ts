import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  BuiltinType,
  CodeListItem,
  CodeListType,
  CompositeType,
  CompositeTypeProperty,
  GeoForgeModel,
  GeoForgePackage,
  GeoForgeType,
  Multiplicity,
  QName,
  SimpleType,
  Tag,
  isBuiltinType,
  isCodeListType,
  isCompositeType,
  isDataType
} from 'geoforge-model/model';

export type ModelToDslOptions = {
  destination?: string;
};

export const modelToDslAction = async (fileName: string, opts: ModelToDslOptions): Promise<void> => {
  const model = await readModelFile(fileName);
  const generatedFilePath = await writeDslFile(model, fileName, opts.destination);
  console.log(chalk.green(`DSL generated to ${generatedFilePath}`));
};

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

async function writeDslFile(model: GeoForgeModel | GeoForgePackage, sourceFilePath: string, destination?: string): Promise<string> {
  const data = extractDestinationAndName(sourceFilePath, destination);
  const generatedFilePath = path.join(data.destination, `${data.name}.geoforge`);

  await fs.mkdir(data.destination, { recursive: true });
  await fs.writeFile(generatedFilePath, renderNamespace(model), 'utf-8');

  return generatedFilePath;
}

function extractDestinationAndName(filePath: string, destination: string | undefined): { destination: string; name: string } {
  const absolute = path.resolve(filePath);
  return {
    destination: destination ?? path.join(path.dirname(absolute), 'generated'),
    name: path.basename(absolute, path.extname(absolute))
  };
}

function renderNamespace(model: GeoForgeModel | GeoForgePackage): string {
  const keyword = model.elementType === 'package' ? 'package' : 'model';
  const description = renderDescriptionPrefix(model.description, '  ');
  const title = renderTitle(model.title);
  const lines: string[] = [`${keyword} ${description}${qName(model.name)}${title}`, ''];

  for (const tag of model.tags) {
    lines.push(renderTag(tag));
  }
  if (model.tags.length > 0) {
    lines.push('');
  }

  for (const type of model.types) {
    lines.push(renderType(type));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderType(type: GeoForgeType): string {
  if (isBuiltinType(type)) {
    return renderBuiltinType(type);
  }
  if (isCodeListType(type)) {
    return renderCodeListType(type);
  }
  if (isCompositeType(type)) {
    return renderCompositeType(type);
  }
  throw new Error(`Unsupported type '${(type as { elementType?: string }).elementType ?? 'unknown'}'.`);
}

function renderBuiltinType(type: BuiltinType): string {
  const parts: string[] = ['builtin'];
  parts.push(`${renderDescriptionPrefix(type.description, '  ')}${simpleName(type.name)}${renderTitle(type.title)}`);
  if (type.params && type.params.length > 0) {
    const params = type.params.map(param => {
      if (param.value === undefined) {
        return `${param.name}!`;
      }
      return `${param.name}=${renderSimpleValue(param.value)}`;
    }).join(', ');
    parts.push(`(${params})`);
  }
  return `${parts.join(' ')}${renderTrailingTags(type.tags)}`;
}

function renderCodeListType(type: CodeListType): string {
  const description = renderDescriptionPrefix(type.description, '  ');
  const lines: string[] = [`codelist ${description}${simpleName(type.name)}${renderTitle(type.title)} {`];
  for (const item of type.items) {
    pushIndented(lines, renderCodeListItem(item), '  ');
  }
  lines.push('}');
  return lines.join('\n');
}

function renderCodeListItem(item: CodeListItem): string {
  const parts: string[] = [`${renderDescriptionPrefix(item.description, '  ')}${simpleName(item.name)}${renderTitle(item.title)}`];
  if (item.value !== undefined) {
    parts.push(`= ${renderString(item.value)}`);
  }
  const tags = renderTrailingTags(item.tags);
  return `${parts.join(' ')}${tags}`;
}

function renderCompositeType(type: CompositeType): string {
  const kind = isDataType(type) ? 'datatype' : 'layer';
  const abstractPrefix = type.abstract ? 'abstract ' : '';
  const extendsClause = type.superType ? ` extends ${typeRefName(type.superType.qName)}` : '';
  const description = renderDescriptionPrefix(type.description, '  ');
  const title = renderTitle(type.title);
  const lines: string[] = [
    `${abstractPrefix}${kind} ${description}${simpleName(type.name)}${title}${extendsClause}${renderTrailingTags(type.tags)} {`
  ];

  for (const prop of type.properties) {
    pushIndented(lines, renderProperty(prop), '  ');
  }

  lines.push('}');
  return lines.join('\n');
}

function renderProperty(prop: CompositeTypeProperty): string {
  const description = renderDescriptionPrefix(prop.description, '  ');
  const kind = prop.kind ? `${renderPropertyKind(prop.kind)} ` : '';
  const title = renderTitle(prop.title);
  const multiplicity = renderMultiplicity(prop.multiplicity);
  const multiplicityPart = multiplicity ? `${multiplicity}` : '';
  const defaultPart = hasRenderableDefaultValue(prop.defaultValue) ? ` = ${renderSimpleValue(prop.defaultValue)}` : '';
  return `${description}${kind}${simpleName(prop.name)}${title}${multiplicityPart}: ${typeRefName(prop.type.qName)}${defaultPart}${renderTrailingTags(prop.tags)}`;
}

function renderPropertyKind(kind: CompositeTypeProperty['kind']): string {
  switch (kind) {
    case 'id':
      return 'identity';
    case 'geometry':
      return 'geometry';
    case 'container':
      return 'parent';
    case 'containment':
    default:
      return 'child';
  }
}

function renderMultiplicity(multiplicity: Multiplicity): string {
  if (multiplicity.lower === 0 && multiplicity.upper === -1) {
    return '*';
  }
  if (multiplicity.lower === 1 && multiplicity.upper === -1) {
    return '+';
  }
  if (multiplicity.lower === 0 && multiplicity.upper === 1) {
    return '?';
  }
  if (multiplicity.lower === 1 && multiplicity.upper === 1) {
    return '';
  }
  if (multiplicity.upper === -1) {
    return `[${multiplicity.lower}..]`;
  }
  return `[${multiplicity.lower}..${multiplicity.upper}]`;
}

function renderTag(tag: Tag): string {
  if (tag.value === undefined) {
    return `$${tag.name}!`;
  }
  return `$${tag.name}=${renderSimpleValue(tag.value)}`;
}

function renderTrailingTags(tags: Tag[]): string {
  if (!tags.length) {
    return '';
  }
  return ` ${tags.map(renderTag).join(' ')}`;
}

function renderSimpleValue(value: SimpleType): string {
  if (typeof value === 'string') {
    return renderString(value);
  }
  return String(value);
}

function hasRenderableDefaultValue(value: SimpleType | null | undefined): value is SimpleType {
  return value !== undefined && value !== null;
}

function renderString(value: string): string {
  return JSON.stringify(value);
}

function renderDescription(value?: string): string {
  if (!value) {
    return '';
  }
  return renderString(value);
}

function renderDescriptionPrefix(value: string | undefined, continuationIndent: string): string {
  const description = renderDescription(value);
  if (!description) {
    return '';
  }
  return `${description}\n${continuationIndent}`;
}

function renderTitle(value?: string): string {
  if (!value) {
    return '';
  }
  return ` ${renderString(value)}`;
}

function pushIndented(target: string[], value: string, indent: string): void {
  const lines = value.split('\n');
  for (const line of lines) {
    target.push(`${indent}${line}`);
  }
}

function qName(name: QName): string {
  return name.join('.');
}

function simpleName(name: QName): string {
  return name[name.length - 1] ?? 'X';
}

function typeRefName(name: QName): string {
  return simpleName(name);
}
