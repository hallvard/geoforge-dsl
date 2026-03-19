import { BuiltinType, CompositeType, EnumType, isBuiltinType, isCompositeType, isEnumType, isNamespace, isOneOrMoreMultiplicity, isSomeMultiplicity, isTypeDef, isTypeRef, isZeroOrOneMultiplicity, Model, Multiplicity, Property, Tag, TypeDef } from "geoforge-language";
import { propertyName } from "geoforge-language/geoforge-utils";
import {
  BuiltinType as BuiltingeoforgeType,
  CompositeType as CompositegeoforgeType,
  CompositeTypeProperty,
  CodeListType as EnumgeoforgeType,
  isCompositeType as isCompositegeoforgeType,
  nameString,
  PropertyKind,
  Multiplicity as geoforgeMultiplicity,
  GeoForgeModel,
  Tag as geoforgeTag,
  GeoForgeType
} from "geoforge-model/model";

interface BuilderContext {
  typeMap: Map<string, GeoForgeType>;
}

function typeQname(type: TypeDef): string[] {
  var parent = type.$container;
  while (! isNamespace(parent)) {
    parent = parent.$container.$container;
  }
  return [parent.name, type.name ?? 'X'];
}

export function buildModel(model: Model): GeoForgeModel {
  const typeMap = new Map<string, GeoForgeType>();
  return {
    elementType: 'model',
    name: string2Qname(model.name),
    title: model.title,
    description: model.description,
    tags: buildTags(model.tags),
    types: model.types.map(type => buildType(type, { typeMap }))
  };
}

function string2Qname(str: string): string[] {
  return str.split('.');
}

function buildTags(tags: Tag[]): geoforgeTag[] {
  return tags.map(tag => ({
    name: string2Qname(tag.name),
    value: tag.value ? tag.value.value : true
  }));
}

function buildType(type: TypeDef, context: BuilderContext): GeoForgeType {
  console.log("Processing type: " + nameString(typeQname(type)));
  if (isBuiltinType(type)) {
    return buildBuiltinType(type);
  } else if (isEnumType(type)) {
    return buildEnumType(type);
  } else if (isCompositeType(type)) {
    return buildCompositeType(type, context);
  }
  throw new Error("Unsupported type: " + type);
}

function buildReferencedType<T extends TypeDef>(type: TypeDef, context: BuilderContext): GeoForgeType {
  const qnameString = nameString(typeQname(type));
  console.log("Processing referenced type: " + qnameString);
  if (! context.typeMap.has(qnameString)) {
    const geoforgeType = buildType(type, context);
    context.typeMap.set(qnameString, geoforgeType);
  }
  return context.typeMap.get(qnameString)!;
}

function buildCompositeType(type: CompositeType, context: BuilderContext): CompositegeoforgeType {
  let superType = undefined;
  if (type.extends && isTypeDef(type.extends.ref)) {
    const geoforgeType = buildReferencedType(type.extends.ref, context);
    if (isCompositegeoforgeType(geoforgeType)) {
      superType = geoforgeType;
    }
  }
  const typeName = type.name ?? 'X';
  const compositeType: CompositegeoforgeType = {
    elementType: 'compositeType',
    name: string2Qname(typeName),
    title: type.title,
    description: type.description,
    tags: buildTags(type.tags),
    isAbstract: type.isAbstract ?? false,
    kind: type.kind ?? 'layer',
    superType: superType ? {
      qName: superType.name,
      element: superType
    } : undefined,
    properties: type.properties.map(prop => buildCompositeTypeProperty(prop, context))
  };
  context.typeMap.set(typeName, compositeType);
  return compositeType;
}

function buildCompositeTypeProperty(prop: Property, context: BuilderContext): CompositeTypeProperty {
  console.log("...processing property: " + propertyName(prop));
  var propType: GeoForgeType | null = null;
  if (isTypeRef(prop.type)) {
    if (isTypeDef(prop.type.typeRef.ref)) {
      propType = buildReferencedType(prop.type.typeRef.ref, context);
    }
  } else if (isTypeDef(prop.type)) {
    propType = buildType(prop.type, context);
  }
  var kind: PropertyKind = 'containment';
  if (prop.kind == 'geometry') {
    kind = 'geometry';
  } else if (prop.kind == 'identity') {
    kind = 'id';
  } else if (prop.kind == 'parent') {
    kind = 'container';
  }
  return {
    elementType: 'compositeTypeProperty',
    name: string2Qname(prop.name),
    description: prop.description,
    tags: buildTags(prop.tags),
    kind: kind,
    type: {
      qName: propType!.name,
      element: propType!
    },
    multiplicity: buildMultiplicity(prop.multiplicity)
  };
  throw new Error("Unsupported property: " + prop);
}

function buildMultiplicity(multiplicity: Multiplicity | undefined): geoforgeMultiplicity {
  var geoforgeMultiplicity = { lower: 0, upper: -1 };
  if (isOneOrMoreMultiplicity(multiplicity)) {
    geoforgeMultiplicity.lower = 1;
  }
  if (isZeroOrOneMultiplicity(multiplicity)) {
    geoforgeMultiplicity.upper = 1;
  }
  if (isSomeMultiplicity(multiplicity)) {
    geoforgeMultiplicity.lower = multiplicity.lower;
    if (multiplicity.upper) {
      geoforgeMultiplicity.upper = multiplicity.upper;
    }
  }
  return geoforgeMultiplicity;
}

function buildBuiltinType(type: BuiltinType): BuiltingeoforgeType {
  const typeName = type.name ?? 'X';
  const geoforgeType: BuiltingeoforgeType = {
    elementType: 'builtinType',
    name: [typeName],
    description: type.description,
    tags: buildTags(type.tags)
  }
  return geoforgeType;
}

function buildEnumType(type: EnumType): EnumgeoforgeType {
  const typeName = type.name ?? 'X';
  const geoforgeType: EnumgeoforgeType = {
    elementType: 'enumType',
    name: [typeName],
    description: type.description,
    tags: buildTags(type.tags),
    properties: type.properties.map(prop => ({
      elementType: 'enumProperty',
      name: [prop.name],
      description: prop.description,
      tags: buildTags(prop.tags),
      value: prop.value?.value
    }))
  };
  return geoforgeType;
}