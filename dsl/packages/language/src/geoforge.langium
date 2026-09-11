grammar GeoForge

entry Namespace: Package | Model;

Text returns string: STRING;


Package: (description=Text)? 'package' NamespaceFragment;
Model: (description=Text)? 'model' NamespaceFragment;

fragment TagsFragment:
  (tags += Tag)*;

fragment NamespaceFragment:
  name = QName
  TagsFragment
  (imports += Import)*
  (types += TypeDef)*;

Import:
  'import' namespace = [Namespace:QName];

Name returns string: ID;

QName returns string:
  Name ('.' Name)*;

TypeDef: BuiltinType | CompositeType | EnumType;

CompositeType:
  (description=Text)?
  (isAbstract ?= 'abstract')?
  kind = ('datatype' | 'feature')
  name = Name
  TagsFragment
  ('extends' extends = [CompositeType:QName])?
  '{'
    (properties += Property)*
  '}'
  ;

PropertyKind returns string: ('geometry' | 'identity' | 'parent' | 'child');

PropertyType: TypeDef | TypeRef;

TypeRef: typeRef = [TypeDef:QName];

Property:
  (description=Text)?
  (kind = PropertyKind)?
  name = Name
  (multiplicity = Multiplicity)?
  TagsFragment
  ':'
  type = PropertyType
  ('=' defaultValue = LiteralValue)?
  TagsFragment
  ;

Multiplicity: ZeroOrMoreMultiplicity | OneOrMoreMultiplicity | ZeroOrOneMultiplicity | SomeMultiplicity;

ZeroOrMoreMultiplicity: spec = '*';
OneOrMoreMultiplicity: spec = '+';
ZeroOrOneMultiplicity: spec = '?';
SomeMultiplicity: '[' lower = IntLiteral ('..' (upper = IntLiteral)?) ']';

BuiltinType:
  (description=Text)?
  'builtin'
  name = Name
  ('(' (params += BuiltinParam (',' params += BuiltinParam)*)? ')')?
  TagsFragment
  ;

BuiltinParam: name = Name ('!'? | ('=' value = BuiltinParamValue));

BuiltinParamValue: StringValue | DecimalValue | IntValue | NameValue;

EnumType:
  (description=Text)?
  'codelist'
  name = Name
  TagsFragment
  (sourceUrl = STRING)?
  '{'
    (properties += EnumProperty)*
  '}'
  ;

EnumProperty:
  (description=Text)?
  name = (Name | STRING)
  ('=' value = EnumValue)?
  TagsFragment
  ;

EnumValue: StringValue | IntValue | NameValue;

Tag: (modifier = '$' name = QName ('=' value = LiteralValue)) | (modifier = ('+' | '-') name = QName);

LiteralValue: StringValue | UuidValue | DateValue | TimeValue | DateTimeValue | DecimalValue | IntValue | NameValue;

StringValue: value = STRING;
UuidValue: value = UUID;

DateValue: value = DateLiteral;
DateLiteral returns Date: INT '-' INT '-' INT;

TimeValue: value = TimeLiteral;
TimeLiteral returns Date: INT ':' INT (':' INT)? ('.' INT)?;

DateTimeLiteral returns Date: DateLiteral TimeLiteral;
DateTimeValue: value = DateTimeLiteral;

IntValue: value = IntLiteral;
IntLiteral returns number: INT;

DecimalValue: value = DecimalLiteral;
DecimalLiteral returns number: INT '.' INT;

NameValue: value = QName;

hidden terminal WS: /\s+/;
terminal ID: /[\p{L}_][\p{L}0-9_]*/u;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;
terminal UUID: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
terminal INT returns number: /[0-9]+/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
