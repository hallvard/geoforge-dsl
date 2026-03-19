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
      .map(type => plantumlClassForType(type))
      .filter(clazz => clazz !== undefined) as PlantumlClass[];

  const plantumlRelations = Array.from(allTypes.values())
      .flatMap(type => plantumRelationsForType(type))
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
  allTypes.set(simpleName(type), type);
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
}

interface PlantumlRelation {
  source: string;
  sourceLabel?: string;
  target: string;
  targetLabel?: string;
  label: string;
}

function plantumlClassForType(type: GeoForgeType): PlantumlClass | undefined {
  if (isCompositeType(type)) {
    return {
      name: simpleName(type),
      abstract: type.abstract,
      stereotype: isDataType(type) ? 'datatype' : 'layer',
      properties: type.properties
          .map(plantumlPropertyForProperty)
          .filter(p => p !== undefined) as PlantumlProperty[],
    }
  }
  return undefined;
}

function plantumlPropertyForProperty(prop: CompositeTypeProperty): PlantumlProperty | undefined {
  const propType = prop.type.element;
  if (isBuiltinType(propType) || isDataType(propType)) {
    return {
      name: simpleName(prop),
      type: simpleName(prop.type.element!)
    }
  }
  return undefined
}

function plantumRelationsForType(type: GeoForgeType): PlantumlRelation[] | undefined {
  if (isCompositeType(type)) {
    return type.properties
        .map(prop => plantumlRelationForProperty(prop, type))
        .filter(p => p !== undefined) as PlantumlRelation[]
  }
  return undefined;
}

function plantumlRelationForProperty(prop: CompositeTypeProperty, owner: CompositeType): PlantumlRelation | undefined {
  const propType = prop.type.element;
  if (isLayerType(propType)) {
    return {
      source: simpleName(owner),
      sourceLabel: undefined,
      target: simpleName(propType),
      targetLabel: undefined,
      label: simpleName(prop)
    }
  }
  return undefined
}

function plantumlForClass(clazz: PlantumlClass): Generated {
  return expandToNode`
    class ${clazz.name} {
        ${joinToNode(clazz.properties, plantumlForProperty, { appendNewLineIfNotEmpty: true })}
    }`;
}

function plantumlForProperty(prop: PlantumlProperty): Generated {
  return `${prop.name}: ${prop.type}`;
}

function plantumlForRelation(rel: PlantumlRelation): Generated {
  return expandToNode`${rel.source} ${rel.sourceLabel} *-> ${rel.targetLabel} ${rel.target}: ${rel.label}`
}
