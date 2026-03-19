import { GeoForgeModel, GeoForgeType, CodeListType, CompositeType, CompositeTypeProperty, isBuiltinType, isCodeListType, isCompositeType, isDataType, simpleName } from './model.js';

export interface JavaSourceFile {
  relativePath: string;
  content: string;
}

export function generateJavaSources(model: GeoForgeModel): JavaSourceFile[] {
  const allTypes = collectReachableTypes(model.types);
  const files: JavaSourceFile[] = [];
  for (const type of allTypes.values()) {
    const typePackage = type.name.slice(0, -1).join('.');
    const typePackagePath = type.name.slice(0, -1).join('/');
    if (isDataType(type)) {
      files.push({
        relativePath: `${typePackagePath}/${simpleName(type)}.java`,
        content: renderRecord(typePackage, type)
      });
    } else if (isCompositeType(type)) {
      files.push({
        relativePath: `${typePackagePath}/${simpleName(type)}.java`,
        content: renderBean(typePackage, type)
      });
    } else if (isCodeListType(type)) {
      files.push({
        relativePath: `${typePackagePath}/${simpleName(type)}.java`,
        content: renderEnum(typePackage, type)
      });
    }
  }

  return files;
}

function collectReachableTypes(types: GeoForgeType[]): Map<string, GeoForgeType> {
  const allTypes = new Map<string, GeoForgeType>();

  const visit = (type: GeoForgeType): void => {
    const key = type.name.join('.');
    if (allTypes.has(key)) {
      return;
    }
    allTypes.set(key, type);

    if (isCompositeType(type)) {
      if (type.superType?.element) {
        visit(type.superType.element);
      }
      for (const prop of type.properties) {
        if (prop.type.element) {
          visit(prop.type.element);
        }
      }
    }
  };

  for (const type of types) {
    visit(type);
  }
  return allTypes;
}

function renderRecord(packageName: string, type: CompositeType): string {
  const components = type.properties.map(prop => `${javaType(prop)} ${safeIdentifier(simpleName(prop))}`).join(',\n    ');
  const imports = collectImports(packageName, type.properties, false);

  return [
    `package ${packageName};`,
    '',
    ...imports,
    ...imports.length ? [''] : [],
    `public record ${simpleName(type)}(`,
    `    ${components}`,
    ') {',
    '}'
  ].join('\n');
}

function renderBean(packageName: string, type: CompositeType): string {
  const imports = collectImports(packageName, type.properties, true);
  const fieldLines = type.properties.map(renderBeanField).join('\n');
  const accessorLines = type.properties.map(renderBeanAccessors).join('\n\n');

  const lines: string[] = [
    `package ${packageName};`,
    '',
    ...imports,
    ...imports.length ? [''] : [],
    `public class ${simpleName(type)} {`,
    fieldLines,
    '',
    `    public ${simpleName(type)}() {`,
    '    }'
  ];

  if (accessorLines.trim().length > 0) {
    lines.push('', accessorLines);
  }

  lines.push('}');
  return lines.join('\n');
}

function renderEnum(packageName: string, type: CodeListType): string {
  const constants = type.items.map(item => {
    const constant = toEnumConstant(simpleName(item));
    const label = item.value ?? simpleName(item);
    return `    ${constant}("${escapeJavaString(label)}")`;
  }).join(',\n');

  return [
    `package ${packageName};`,
    '',
    `public enum ${simpleName(type)} {`,
    `${constants};`,
    '',
    '    private final String label;',
    '',
    `    ${simpleName(type)}(String label) {`,
    '        this.label = label;',
    '    }',
    '',
    '    public String getLabel() {',
    '        return label;',
    '    }',
    '}'
  ].join('\n');
}

function renderBeanField(prop: CompositeTypeProperty): string {
  const fieldName = safeIdentifier(simpleName(prop));
  const type = javaType(prop);
  if (isCollection(prop)) {
    return `    private ${type} ${fieldName} = new ArrayList<>();`;
  }
  return `    private ${type} ${fieldName};`;
}

function renderBeanAccessors(prop: CompositeTypeProperty): string {
  const fieldName = safeIdentifier(simpleName(prop));
  const type = javaType(prop);
  const suffix = capitalizeIdentifier(fieldName);

  return [
    `    public ${type} get${suffix}() {`,
    `        return ${fieldName};`,
    '    }',
    '',
    `    public void set${suffix}(${type} ${fieldName}) {`,
    `        this.${fieldName} = ${fieldName};`,
    '    }'
  ].join('\n');
}

function javaType(prop: CompositeTypeProperty): string {
  const baseType = resolveJavaBaseType(prop.type.qName[prop.type.qName.length - 1] ?? 'Object', prop.type.element);
  if (isCollection(prop)) {
    return `List<${baseType}>`;
  }
  return baseType;
}

function resolveJavaBaseType(fallbackSimpleName: string, type?: GeoForgeType): string {
  if (!type) {
    return normalizeBuiltinTypeName(fallbackSimpleName);
  }
  if (isBuiltinType(type)) {
    return normalizeBuiltinTypeName(simpleName(type));
  }
  return simpleName(type);
}

function normalizeBuiltinTypeName(name: string): string {
  const normalized = name.trim();
  if (normalized === 'string') {
    return 'String';
  }
  if (normalized === 'integer') {
    return 'int';
  }
  if (normalized === 'bool') {
    return 'boolean';
  }
  return normalized;
}

function isCollection(prop: CompositeTypeProperty): boolean {
  return prop.multiplicity.upper !== 1;
}

function collectImports(ownerPackage: string, properties: CompositeTypeProperty[], includeArrayList: boolean): string[] {
  const imports = new Set<string>();
  let needsList = false;

  for (const prop of properties) {
    if (isCollection(prop)) {
      needsList = true;
    }
    const referencedType = prop.type.element;
    if (!referencedType || isBuiltinType(referencedType)) {
      continue;
    }
    const referencedPackage = referencedType.name.slice(0, -1).join('.');
    if (referencedPackage && referencedPackage !== ownerPackage) {
      imports.add(`import ${referencedType.name.join('.')};`);
    }
  }

  if (needsList) {
    imports.add('import java.util.List;');
    if (includeArrayList) {
      imports.add('import java.util.ArrayList;');
    }
  }

  return Array.from(imports).sort();
}

function toEnumConstant(value: string): string {
  const normalized = value
    .replace(/[^\p{L}\p{N}_]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized.length > 0 ? normalized : 'UNKNOWN';
}

function safeIdentifier(value: string): string {
  const normalized = value.replace(/[^\p{L}\p{N}_$]/gu, '_');
  if (!normalized.length) {
    return 'field';
  }
  if (/^[\p{N}]/u.test(normalized)) {
    return `_${normalized}`;
  }
  return normalized;
}

function capitalizeIdentifier(value: string): string {
  if (!value.length) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeJavaString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
