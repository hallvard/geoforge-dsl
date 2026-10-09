import { expandToNode, Generated, GeneratorNode, joinToNode } from 'langium/generate';
import { CompositeType, CompositeTypeProperty, GeoForgeType, effectivePropertyKind, isCompositeType, isDataType, isLayerType, name, simpleName } from './model.js';
import { Namespace, Resolver } from './model-index.js';
import { ModelSelection, Patterns, collectReachableTypes, compile, matchesAny, matchesKind, matchesPropertyKind, selectTypes, typeKind } from './model-selection.js';

export type PlantumlGenerateOptions = {
    destination?: string;
}

/**
 * Contents of a `<model>.puml-options.json` file: either a list of diagram descriptors or an object
 * `{ "diagrams": [...] }`. Each descriptor configures one diagram generated from the model. All
 * patterns are regular expressions, see {@link ModelSelection}.
 */
export type PlantumlOptionsFile = PlantumlOptions[] | { diagrams: PlantumlOptions[] };

export interface PlantumlOptions {
  /** Names the diagram: it is written to "<model>.<name>.puml". Defaults to "diagram<n>". */
  name?: string;
  /** Diagram title; defaults to the model's name. */
  title?: string;
  /** Which types become classes in the diagram. */
  selection?: ModelSelection;
  diagram?: DiagramOptions;
}

/**
 * Show/hide of properties, matched on the property's simple name, kind and type's kind. Like the selection's
 * include/exclude: a property is shown if it matches all given `show-*` options (no `show-*` means
 * all) and no `hide-*` option. A hidden property is also left out as a relation.
 */
export interface DiagramOptions {
  'show-property'?: Patterns;
  'hide-property'?: Patterns;
  /** Patterns matched against the kind of the property: identity, geometry, parent, child or relation. */
  'show-property-kind'?: Patterns;
  'hide-property-kind'?: Patterns;
  /**
   * Patterns matched against the kind of the property's *type*: feature, datatype, codelist or
   * builtin (a property whose type can't be resolved has none). A property of a selected feature
   * type is drawn as an arrow, one of any other type as a field.
   */
  'show-property-type-kind'?: Patterns;
  'hide-property-type-kind'?: Patterns;
  /**
   * What to do with a property whose type is a feature type that is not selected: `hide` it (default)
   * or `field`: show it as a field instead of as a relation.
   */
  'unselected-references'?: 'hide' | 'field';
}

/**
 * `resolver` is used both to resolve individual Refs and to discover the full graph of types to
 * diagram -- since a cross-file type is no longer inlined into `spec.types` (see model-index.ts),
 * reachable types (supertypes, property types) are pulled in here on demand via `resolver`.
 * `options` narrows that graph down and configures the diagram; without it everything is shown.
 */
export function generatePlantuml(spec: Namespace, resolver: Resolver, writer: (node: GeneratorNode) => void, options: PlantumlOptions = {}): void {

  const allTypes = collectReachableTypes(spec, resolver);
  const selectedTypes = selectTypes(allTypes, options.selection);
  const propertyFilter = createPropertyFilter(options.diagram);
  const unselectedAsField = options.diagram?.['unselected-references'] === 'field';
  const isSelected = (type: GeoForgeType | undefined): boolean => type !== undefined && selectedTypes.has(name(type));

  const plantumlClasses = Array.from(selectedTypes.values())
      .map(({ type, resolver }) => plantumlClassForType(type, resolver, propertyFilter, isSelected, unselectedAsField))
      .filter(clazz => clazz !== undefined) as PlantumlClass[];

  const plantumlRelations = Array.from(selectedTypes.values())
      .flatMap(({ type, resolver }) => plantumRelationsForType(type, resolver, propertyFilter, isSelected))
      .filter(rel => rel !== undefined) as PlantumlRelation[];

  const fileNode = expandToNode`
      @startuml "${options.title ?? name(spec)}"
      ${joinToNode(plantumlClasses, plantumlForClass, { appendNewLineIfNotEmpty: true })}
      ${joinToNode(plantumlRelations, plantumlForRelation, { appendNewLineIfNotEmpty: true })}
      @enduml
  `.appendNewLineIfNotEmpty();
  writer(fileNode);
}

type PropertyFilter = (prop: CompositeTypeProperty, resolver: Resolver) => boolean;

function createPropertyFilter(options: DiagramOptions | undefined): PropertyFilter {
  const showName = compile(options?.['show-property'], 'show-property');
  const hideName = compile(options?.['hide-property'], 'hide-property');
  const showKind = compile(options?.['show-property-kind'], 'show-property-kind');
  const hideKind = compile(options?.['hide-property-kind'], 'hide-property-kind');
  const showTypeKind = compile(options?.['show-property-type-kind'], 'show-property-type-kind');
  const hideTypeKind = compile(options?.['hide-property-type-kind'], 'hide-property-type-kind');
  return (prop, resolver) => {
    const propName = simpleName(prop);
    const propType = resolver.resolve(prop.type)?.type;
    const kind = effectivePropertyKind(prop, propType);
    const typeKindName = propType && typeKind(propType);
    return matchesAny(showName, propName)
        && (showKind === undefined || matchesPropertyKind(showKind, kind))
        && !(hideName && matchesAny(hideName, propName))
        && !(hideKind && matchesPropertyKind(hideKind, kind))
        && (!showTypeKind || matchesKind(showTypeKind, typeKindName))
        && !(hideTypeKind && matchesKind(hideTypeKind, typeKindName));
  };
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

function plantumlClassForType(type: GeoForgeType, resolver: Resolver, propertyFilter: PropertyFilter, isSelected: TypeFilter, unselectedAsField: boolean): PlantumlClass | undefined {
  if (isCompositeType(type)) {
    return {
      name: simpleName(type),
      abstract: type.abstract,
      stereotype: isDataType(type) ? 'datatype' : 'layer',
      properties: type.properties
          .filter(prop => propertyFilter(prop, resolver))
          .map(prop => plantumlPropertyForProperty(prop, resolver, isSelected, unselectedAsField))
          .filter(p => p !== undefined) as PlantumlProperty[],
    }
  }
  return undefined;
}

function plantumlPropertyForProperty(prop: CompositeTypeProperty, resolver: Resolver, isSelected: TypeFilter, unselectedAsField: boolean): PlantumlProperty | undefined {
  const propType = resolver.resolve(prop.type)?.type;
  const unselectedReference = unselectedAsField && isLayerType(propType) && !isSelected(propType);
  if (!propType || isDataType(propType) || !isCompositeType(propType) || unselectedReference) {
    return {
      name: simpleName(prop),
      type: propType ? simpleName(propType) : simpleNameFromQName(prop.type.qName),
      multiple: isMultiple(prop)
    }
  }
  return undefined
}

type TypeFilter = (type: GeoForgeType | undefined) => boolean;

function plantumRelationsForType(type: GeoForgeType, resolver: Resolver, propertyFilter: PropertyFilter, isSelected: TypeFilter): PlantumlRelation[] | undefined {
  if (isCompositeType(type)) {
    const inheritance = plantumlInheritanceRelation(type, resolver, isSelected);
    const propertyRelations = type.properties
        .filter(prop => propertyFilter(prop, resolver))
        .map(prop => plantumlRelationForProperty(prop, type, resolver, isSelected))
        .filter(p => p !== undefined) as PlantumlRelation[];
    return inheritance ? [inheritance, ...propertyRelations] : propertyRelations;
  }
  return undefined;
}

function plantumlInheritanceRelation(type: CompositeType, resolver: Resolver, isSelected: TypeFilter): PlantumlRelation | undefined {
  if (!type.superType) {
    return undefined;
  }
  const superType = resolver.resolve(type.superType)?.type;
  if (!superType || !isCompositeType(superType) || !isSelected(superType)) {
    return undefined;
  }
  return {
    source: simpleName(superType),
    target: simpleName(type),
    arrow: '<|--'
  };
}

function plantumlRelationForProperty(prop: CompositeTypeProperty, owner: CompositeType, resolver: Resolver, isSelected: TypeFilter): PlantumlRelation | undefined {
  const propType = resolver.resolve(prop.type)?.type;
  if (isLayerType(propType) && isSelected(propType)) {
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

function simpleNameFromQName(qName: string[]): string {
  return qName[qName.length - 1] ?? 'Unknown';
}

function plantumlForClass(clazz: PlantumlClass): Generated {
  return expandToNode`
    ${clazz.abstract ? 'abstract ' : ''}class ${clazz.name} {
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
