import {
  BuiltinParamValue,
  BuiltinType,
  CompositeType,
  EnumType,
  EnumValue,
  isBuiltinType,
  isCompositeType,
  isDateTimeValue,
  isDateValue,
  isDecimalValue,
  isEnumType,
  isIntValue,
  isModel,
  isNameValue,
  isOneOrMoreMultiplicity,
  isPackage,
  isSomeMultiplicity,
  isStringValue,
  isTimeValue,
  isTypeDef,
  isTypeRef,
  isUuidValue,
  isZeroOrMoreMultiplicity,
  isZeroOrOneMultiplicity,
  LiteralValue,
  Model,
  Multiplicity,
  Property,
  Tag,
  TypeDef
} from "geoforge-language";
import { propertyName, typeName } from "geoforge-language/geoforge-utils";
import {
  BuiltinType as BuiltingeoforgeType,
  CompositeType as CompositegeoforgeType,
  CompositeTypeProperty,
  CodeListType as CodeListgeoforgeType,
  isCompositeType as isCompositegeoforgeType,
  nameString,
  PropertyKind,
  SimpleType,
  BuiltinParam as geoforgeBuiltinParam,
  Multiplicity as geoforgeMultiplicity,
  GeoForgeModel,
  Tag as geoforgeTag,
  GeoForgeType
} from "geoforge-model/model";

interface BuilderContext {
  typeMap: Map<string, GeoForgeType>;
}

function typeQname(type: TypeDef): string[] {
  let parent: unknown = type.$container;
  while (parent && !isModel(parent) && !isPackage(parent)) {
    parent = (parent as { $container?: unknown }).$container;
  }
  const localTypeName = typeName(type);
  if (parent && (isModel(parent) || isPackage(parent))) {
    return [...string2Qname(parent.name), localTypeName];
  }
  return [localTypeName];
}

export function buildModel(model: Model): GeoForgeModel {
  const context: BuilderContext = { typeMap: new Map<string, GeoForgeType>() };
  return {
    entityType: 'model',
    name: string2Qname(model.name),
    title: model.title,
    description: model.description,
    tags: buildTags(model.tags),
    types: model.types.map(type => buildReferencedType(type, context))
  };
}

function string2Qname(str: string): string[] {
  return str.split('.');
}

function buildTags(tags: Tag[]): geoforgeTag[] {
  return tags.map(tag => ({
    name: tag.name,
    value: tag.value ? buildSimpleValue(tag.value) : true
  }));
}

function buildType(type: TypeDef, context: BuilderContext): GeoForgeType {
  const qName = typeQname(type);
  const qnameString = nameString(qName);
  const existing = context.typeMap.get(qnameString);
  if (existing) {
    return existing;
  }

  if (isBuiltinType(type)) {
    const geoforgeType = buildBuiltinType(type, qName);
    context.typeMap.set(qnameString, geoforgeType);
    return geoforgeType;
  } else if (isEnumType(type)) {
    const geoforgeType = buildEnumType(type, qName);
    context.typeMap.set(qnameString, geoforgeType);
    return geoforgeType;
  } else if (isCompositeType(type)) {
    return buildCompositeType(type, context);
  }
  throw new Error("Unsupported type: " + type);
}

function buildReferencedType(type: TypeDef, context: BuilderContext): GeoForgeType {
  const qnameString = nameString(typeQname(type));
  if (!context.typeMap.has(qnameString)) {
    const geoforgeType = buildType(type, context);
    context.typeMap.set(qnameString, geoforgeType);
  }
  return context.typeMap.get(qnameString)!;
}

function buildCompositeType(type: CompositeType, context: BuilderContext): CompositegeoforgeType {
  const typeQName = typeQname(type);
  const typeQNameString = nameString(typeQName);
  const existing = context.typeMap.get(typeQNameString);
  if (existing && isCompositegeoforgeType(existing)) {
    return existing;
  }

  const compositeType: CompositegeoforgeType = {
    entityType: type.kind === 'datatype' ? 'dataType' : 'layerType',
    name: typeQName,
    title: type.title,
    description: type.description,
    tags: buildTags(type.tags),
    abstract: type.isAbstract ?? false,
    superType: undefined,
    properties: []
  };
  context.typeMap.set(typeQNameString, compositeType);

  if (type.extends && isTypeDef(type.extends.ref)) {
    const geoforgeType = buildReferencedType(type.extends.ref, context);
    if (isCompositegeoforgeType(geoforgeType)) {
      compositeType.superType = {
        qName: geoforgeType.name,
        element: geoforgeType
      };
    }
  }

  compositeType.properties = type.properties.map(prop => buildCompositeTypeProperty(prop, context));
  return compositeType;
}

function buildCompositeTypeProperty(prop: Property, context: BuilderContext): CompositeTypeProperty {
  let propType: GeoForgeType | null = null;
  if (isTypeRef(prop.type)) {
    if (isTypeDef(prop.type.typeRef.ref)) {
      propType = buildReferencedType(prop.type.typeRef.ref, context);
    }
  } else if (isTypeDef(prop.type)) {
    propType = buildReferencedType(prop.type, context);
  }
  if (!propType) {
    throw new Error(`Property '${propertyName(prop)}' has an unresolved type.`);
  }

  let kind: PropertyKind = 'containment';
  if (prop.kind == 'geometry') {
    kind = 'geometry';
  } else if (prop.kind == 'identity') {
    kind = 'id';
  } else if (prop.kind == 'parent') {
    kind = 'container';
  } else if (prop.kind == 'child') {
    kind = 'containment';
  }

  return {
    entityType: 'compositeTypeProperty',
    name: string2Qname(prop.name),
    title: prop.title,
    description: prop.description,
    tags: buildTags(prop.tags),
    kind,
    type: {
      qName: propType.name,
      element: propType
    },
    multiplicity: buildMultiplicity(prop.multiplicity),
    defaultValue: buildSimpleValue(prop.defaultValue)
  };
}

function buildMultiplicity(multiplicity: Multiplicity | undefined): geoforgeMultiplicity {
  var geoforgeMultiplicity = { lower: 1, upper: 1 };
  if (isZeroOrMoreMultiplicity(multiplicity)) {
    geoforgeMultiplicity.lower = 0;
    geoforgeMultiplicity.upper = -1;
  }
  if (isOneOrMoreMultiplicity(multiplicity)) {
    geoforgeMultiplicity.lower = 1;
    geoforgeMultiplicity.upper = -1;
  }
  if (isZeroOrOneMultiplicity(multiplicity)) {
    geoforgeMultiplicity.lower = 0;
    geoforgeMultiplicity.upper = 1;
  }
  if (isSomeMultiplicity(multiplicity)) {
    geoforgeMultiplicity.lower = multiplicity.lower;
    if (multiplicity.upper !== undefined) {
      geoforgeMultiplicity.upper = multiplicity.upper;
    }
  }
  return geoforgeMultiplicity;
}

function buildBuiltinType(type: BuiltinType, qName: string[]): BuiltingeoforgeType {
  const geoforgeType: BuiltingeoforgeType = {
    entityType: 'builtinType',
    name: qName,
    title: type.title,
    description: type.description,
    tags: buildTags(type.tags),
    params: type.params.map(buildBuiltinParam)
  };
  return geoforgeType;
}

function buildBuiltinParam(param: { name: string; value?: BuiltinParamValue }): geoforgeBuiltinParam {
  return {
    name: param.name,
    value: buildSimpleValue(param.value)
  };
}

function buildEnumType(type: EnumType, qName: string[]): CodeListgeoforgeType {
  const geoforgeType: CodeListgeoforgeType = {
    entityType: 'codeListType',
    name: qName,
    title: type.title,
    description: type.description,
    tags: buildTags(type.tags),
    items: type.properties.map(prop => ({
      entityType: 'codeListItem',
      name: [prop.name],
      title: prop.title,
      description: prop.description,
      tags: buildTags(prop.tags),
      value: buildSimpleValue(prop.value)?.toString()
    }))
  };
  return geoforgeType;
}

function buildSimpleValue(value?: LiteralValue | EnumValue | BuiltinParamValue): SimpleType | undefined {
  if (!value) {
    return undefined;
  }
  if (isStringValue(value) || isNameValue(value) || isUuidValue(value)) {
    return value.value;
  }
  if (isIntValue(value) || isDecimalValue(value)) {
    return value.value;
  }
  if (isDateValue(value) || isTimeValue(value) || isDateTimeValue(value)) {
    return value.value.toISOString();
  }
  return undefined;
}