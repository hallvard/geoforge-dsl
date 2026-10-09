export type QName = string[];

interface ModelElement {
  elementType: string;
  name: QName;
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

export function isCodeListType(element?: ModelElement): element is CodeListType {
  return element !== undefined && isA(element, 'codeListType');
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
  name: string;
  value?: SimpleType;
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

export interface CompositeType<TSuper extends CompositeType<any> = CompositeType<any>> extends GeoForgeType {
  elementType: 'dataType' | 'layerType';
  abstract: boolean;
  superType?: TypeRef<TSuper>;
  properties: CompositeTypeProperty[];
}

export interface DataType extends CompositeType<DataType> {
  elementType: 'dataType';
}

export interface LayerType extends CompositeType<LayerType> {
  elementType: 'layerType';
}

/** Empty (undefined) on a property written without a keyword -- see {@link effectivePropertyKind} for what generators should treat it as. */
export type PropertyKind = 'id' | 'geometry' | 'containment' | 'container';

/** A property's role: its explicit {@link PropertyKind}, or `relation` for a plain property of a feature type. */
export type EffectivePropertyKind = PropertyKind | 'relation';

/**
 * The role of `prop` as generators should treat it: the explicit kind if there is one, else
 * implied by the type of the property -- `container` and `containment` are only meaningful for
 * feature types, so a property of any other type (datatype, codelist, builtin) is implicitly a
 * `containment` (contained value), while a plain property of a feature type is a `relation`.
 * `propType` is the resolved type of `prop`; if it can't be resolved, the property is treated as
 * a `containment`.
 */
export function effectivePropertyKind(prop: CompositeTypeProperty, propType: GeoForgeType | undefined): EffectivePropertyKind {
  return prop.kind ?? (isLayerType(propType) ? 'relation' : 'containment');
}

export interface CompositeTypeProperty extends ModelElement {
  elementType: 'compositeTypeProperty';
  kind?: PropertyKind;
  type: TypeRef<GeoForgeType>;
  multiplicity: Multiplicity;
  defaultValue?: SimpleType;
}

export interface Ref<T extends ModelElement = ModelElement> {
  qName: QName;
  /**
   * Base filename (no directory) of the .geoforge source declaring the referenced element, e.g.
   * "nadag-datatyper.geoforge". Absent when the element is declared in the same model/package as
   * this Ref. Files that cross-reference each other are expected to live in the same directory,
   * with their compiled "<name>.geoforge.json" siblings alongside them -- see
   * geoforge-model/model-index and the cli's model-loader.
   */
  sourceFile?: string;
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

export interface CodeListType extends GeoForgeType {
  elementType: 'codeListType';
  items: CodeListItem[];
  /** Present when this codelist's values come from an external register rather than being enumerated here. */
  sourceUrl?: string;
  asDictionary?: boolean;
}

export interface CodeListItem extends ModelElement {
  elementType: 'codeListItem';
  value?: string;
}