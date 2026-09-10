/**
 * Model for the feature catalogue interchange format (see sample-feature_catalogue.json).
 * This mirrors the JSON shape as-is; mapping it onto the GeoForge model happens separately.
 */

export type FeatureCatalogue = FeatureCatalogueClass[];

/** Multiplicity as found in the format, e.g. "1", "0..1", "1..*", "0..*". */
export type Cardinality = string;

export interface FeatureCatalogueClass {
  name: string;
  description?: string;
  attributes: FeatureCatalogueAttribute[];
  abstract: boolean;
  relationships: Relationships;
  package: string;
}

export interface Relationships {
  inheritance: string[];
  associations: Association[];
}

export interface Association {
  target: string;
  role: string;
  cardinality: Cardinality;
}

export interface FeatureCatalogueAttribute {
  name: string;
  type: string;
  description?: string;
  cardinality: Cardinality;
  taggedValues?: Record<string, string>;
  valueDomain?: ValueDomain;
  /** Present when the attribute's type is a composed/embedded structure rather than a named reference. */
  attributes?: FeatureCatalogueAttribute[];
}

export interface ValueDomain {
  kind: 'codelist';
  definition?: string;
  asDictionary?: boolean | 'true' | 'false';
  codeList?: string;
  listedValues?: CodeListValue[];
}

export interface CodeListValue {
  value: string;
  label: string;
}
