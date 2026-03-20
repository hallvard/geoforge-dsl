import { expandToNode, Generated, GeneratorNode, joinToNode } from 'langium/generate';
import { CompositeType, CompositeTypeProperty, GeoForgeModel, GeoForgeType, isBuiltinType, isCompositeType, isDataType, isLayerType, name, simpleName } from './model.js';

export type PlantumlGenerateOptions = {
    destination?: string;
}

export function generatePlantuml(spec: GeoForgeModel, writer: (node: GeneratorNode) => void): void {

  const allTypes = new Map<string, GeoForgeType>();
  for (const type of spec.types) {
    addTypes(type, allTypes);
  }

  const plantumlClasses = Array.from(allTypes.values())
      .map(type => plantumlClassForType(type, allTypes))
      .filter(clazz => clazz !== undefined) as PlantumlClass[];

  const plantumlRelations = Array.from(allTypes.values())
      .flatMap(type => plantumRelationsForType(type, allTypes))
      .filter(rel => rel !== undefined) as PlantumlRelation[];

  const fileNode = expandToNode`
      @startuml "${name(spec)}"
      ${joinToNode(plantumlClasses, plantumlForClass, { appendNewLineIfNotEmpty: true })}
      ${joinToNode(plantumlRelations, plantumlForRelation, { appendNewLineIfNotEmpty: true })}
      @enduml
  `.appendNewLineIfNotEmpty();
  writer(fileNode);
}

function addTypes(type: GeoForgeType, allTypes: Map<string, GeoForgeType>): void {
  const key = name(type);
  if (allTypes.has(key)) {
    return;
  }
  allTypes.set(key, type);
  if (isCompositeType(type)) {
    for (const prop of type.properties) {
      if (prop.type.element) {
        addTypes(prop.type.element, allTypes);
      }
    }
  }
}

interface PlantumlClass {
  name: string;
  abstract: boolean;
  stereotype?: string;
  properties: PlantumlProperty[];
}

interface PlantumlProperty {
  name: string;
  type: string;
  multiple?: boolean;
}

interface PlantumlRelation {
  source: string;
  sourceLabel?: string;
  target: string;
  targetLabel?: string;
  label?: string;
  arrow: string;
}

function plantumlClassForType(type: GeoForgeType, allTypes: Map<string, GeoForgeType>): PlantumlClass | undefined {
  if (isCompositeType(type)) {
    return {
      name: simpleName(type),
      abstract: type.abstract,
      stereotype: isDataType(type) ? 'datatype' : 'layer',
      properties: type.properties
          .map(prop => plantumlPropertyForProperty(prop, allTypes))
          .filter(p => p !== undefined) as PlantumlProperty[],
    }
  }
  return undefined;
}

function plantumlPropertyForProperty(prop: CompositeTypeProperty,
    allTypes: Map<string, GeoForgeType>): PlantumlProperty | undefined {
  const propType = resolvePropType(prop, allTypes);
  if (isBuiltinType(propType) || isDataType(propType) || isBuiltinTypeRef(prop)) {
    return {
      name: simpleName(prop),
      type: propType ? simpleName(propType) : simpleNameFromQName(prop.type.qName),
      multiple: isMultiple(prop)
    }
  }
  return undefined
}

function plantumRelationsForType(type: GeoForgeType,
    allTypes: Map<string, GeoForgeType>): PlantumlRelation[] | undefined {
  if (isCompositeType(type)) {
    const inheritance = plantumlInheritanceRelation(type, allTypes);
    const propertyRelations = type.properties
        .map(prop => plantumlRelationForProperty(prop, type, allTypes))
        .filter(p => p !== undefined) as PlantumlRelation[];
    return inheritance ? [inheritance, ...propertyRelations] : propertyRelations;
  }
  return undefined;
}

function plantumlInheritanceRelation(type: CompositeType,
    allTypes: Map<string, GeoForgeType>): PlantumlRelation | undefined {
  if (!type.superType) {
    return undefined;
  }
  const superType = resolveTypeByQName(type.superType.qName, allTypes);
  if (!superType || !isCompositeType(superType)) {
    return undefined;
  }
  return {
    source: simpleName(superType),
    target: simpleName(type),
    arrow: '<|--'
  };
}

function plantumlRelationForProperty(prop: CompositeTypeProperty, owner: CompositeType,
    allTypes: Map<string, GeoForgeType>): PlantumlRelation | undefined {
  const propType = resolvePropType(prop, allTypes);
  if (isLayerType(propType)) {
    return {
      source: simpleName(owner),
      sourceLabel: undefined,
      target: simpleName(propType),
      targetLabel: isMultiple(prop) ? '*' : undefined,
      label: simpleName(prop),
      arrow: '*->'
    }
  }
  return undefined
}

function isMultiple(prop: CompositeTypeProperty): boolean {
  return prop.multiplicity.upper < 0 || prop.multiplicity.upper > 1;
}

function resolvePropType(prop: CompositeTypeProperty, allTypes: Map<string, GeoForgeType>): GeoForgeType | undefined {
  if (prop.type.element) {
    return prop.type.element;
  }
  return resolveTypeByQName(prop.type.qName, allTypes);
}

function resolveTypeByQName(qName: string[], allTypes: Map<string, GeoForgeType>): GeoForgeType | undefined {
  const byQualifiedName = allTypes.get(qName.join('.'));
  if (byQualifiedName) {
    return byQualifiedName;
  }
  const tail = simpleNameFromQName(qName);
  const matches = Array.from(allTypes.values()).filter(type => simpleName(type) === tail);
  if (matches.length === 1) {
    return matches[0];
  }
  return undefined;
}

function simpleNameFromQName(qName: string[]): string {
  return qName[qName.length - 1] ?? 'Unknown';
}

function isBuiltinTypeRef(prop: CompositeTypeProperty): boolean {
  return prop.type.qName.join('.').startsWith('geoforge.lib.');
}

function plantumlForClass(clazz: PlantumlClass): Generated {
  return expandToNode`
    class ${clazz.name} {
        ${joinToNode(clazz.properties, plantumlForProperty, { appendNewLineIfNotEmpty: true })}
    }`;
}

function plantumlForProperty(prop: PlantumlProperty): Generated {
  const multiple = prop.multiple ? '*' : '';
  return `${prop.name}${multiple}: ${prop.type}`;
}

function plantumlForRelation(rel: PlantumlRelation): Generated {
  const sourceLabel = rel.sourceLabel ? ` "${rel.sourceLabel}"` : '';
  const targetLabel = rel.targetLabel ? ` "${rel.targetLabel}"` : '';
  const label = rel.label ? `: ${rel.label}` : '';
  return `${rel.source}${sourceLabel} ${rel.arrow}${targetLabel} ${rel.target}${label}`
}
