export type QName = string[];

interface ModelElement {
  elementType: string;
  name: QName;
  title?: string;
  description?: string;
  tags: Tag[];
}

export function isA(element: ModelElement, elementType: string): boolean {
  return element.elementType === elementType;
}

export function isCompositeType(element?: ModelElement): element is CompositeType {
  return element !== undefined && isA(element, 'compositeType');
}

export function isBuiltinType(element?: ModelElement): element is BuiltinType {
  return element !== undefined && isA(element, 'builtinType');
}

export function isEnumType(element?: ModelElement): element is EnumType {
  return element !== undefined && isA(element, 'enumType');
}

export function nameString(name: QName): string {
  return name.join('.');
}

export function name(modelElement: ModelElement): string {
  return nameString(modelElement.name);
}

export function simpleName(modelElement: ModelElement): string {
  return modelElement.name[modelElement.name.length - 1];
}

export interface Tag {
  name: QName;
  value?: string | Date | number | boolean;
}

interface Namespace extends ModelElement {
  types: GeoForgeType[];
}

export interface GeoForgeModel extends Namespace {
  elementType: 'model';
}

export interface GeoForgePackage extends Namespace {
  elementType: 'package';
}

export interface GeoForgeType extends ModelElement {
}

export type CompositeTypeKind = 'datatype' | 'layer';

export interface CompositeType extends GeoForgeType {
  elementType: 'compositeType';
  isAbstract: boolean;
  kind: CompositeTypeKind;
  superType?: TypeRef<CompositeType>;
  properties: CompositeTypeProperty[];
}

export type PropertyKind = 'id' | 'geometry' | 'association' | 'containment' | 'container';

export interface CompositeTypeProperty extends ModelElement {
  elementType: 'compositeTypeProperty';
  kind: PropertyKind;
  type: TypeRef<GeoForgeType>;
  multiplicity: Multiplicity;
  defaultValue?: string | number | Date | boolean;
}

export interface Ref<T extends ModelElement = ModelElement> {
  qname: QName;
  element: T | undefined;
}

export interface TypeRef<T extends GeoForgeType = GeoForgeType> extends Ref<T> {
}

export interface Multiplicity {
  lower: number;
  upper: number;
}

export interface BuiltinType extends GeoForgeType {
  elementType: 'builtinType';
  mappings: DomainMapping[];
}

export interface DomainMapping {
  domain: QName;
  target: QName;
}

export interface EnumType extends GeoForgeType {
  elementType: 'enumType';
  properties: EnumProperty[];
  mappings: DomainMapping[];
}

export interface EnumProperty extends ModelElement {
  elementType: 'enumProperty';
  value: string | number | undefined;
}