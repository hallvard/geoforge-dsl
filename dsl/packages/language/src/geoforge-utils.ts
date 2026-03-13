import type { Property, TypeDef} from "geoforge-language"
import { isProperty, isTypeDef } from "geoforge-language"

export function typeName(type: TypeDef): string {
  if (type.name) {
    return type.name
  }
  const typeOwner = type.$container
  if (isProperty(typeOwner)) {
    return `${typeName(typeOwner.$container)}_${typeOwner.name}`
  }
  return "unknown"
}

export function propertyName(prop: Property): string {
  return prop.name;
}

export function propertyType(prop: Property): TypeDef {
  if (isTypeDef(prop.type)) {
    return prop.type;
  } else {
    return prop.type.typeRef.ref!;
  }
}

export function propertyTypeName(prop: Property): string {
    return propertyType(prop)?.name ?? "unknown";
}
