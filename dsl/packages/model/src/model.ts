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

export function isDataType(element?: ModelElement): element is DataType {
  return element !== undefined && isA(element, 'dataType');
}

export function isLayerType(element?: ModelElement): element is LayerType {
  return element !== undefined && isA(element, 'layerType');
}

export function isCompositeType(element?: ModelElement): element is CompositeType {
  return isDataType(element) || isLayerType(element);
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
  // limit scope
  owner?: QName;
}

export interface CompositeType extends GeoForgeType {
  elementType: 'compositeType';
  isAbstract: boolean;
  superType?: TypeRef<CompositeType>;
  properties: CompositeTypeProperty[];
}

export interface DataType extends GeoForgeType {
  elementType: 'dataType';
}

export interface LayerType extends GeoForgeType {
  elementType: 'layerType';
}

export type PropertyKind = 'id' | 'geometry' | 'containment' | 'container';

export interface CompositeTypeProperty extends ModelElement {
  elementType: 'compositeTypeProperty';
  kind?: PropertyKind;
  type: TypeRef<GeoForgeType>;
  multiplicity: Multiplicity;
  defaultValue?: SimpleType;
}

export interface Ref<T extends ModelElement = ModelElement> {
  qName: QName;
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
  params?: BuiltinParam[];
}

export type SimpleType = string | number | boolean;

export interface BuiltinParam {
  name: string;
  value?: SimpleType;
}

export interface EnumType extends GeoForgeType {
  elementType: 'enumType';
  properties: EnumProperty[];
}

export interface EnumProperty extends ModelElement {
  elementType: 'enumProperty';
  value?: SimpleType;
}