grammar GeoForge

entry Namespace: Package | Model;

Package: 'package' NamespaceFragment;
Model: 'model' NamespaceFragment;

fragment NamespaceFragment:
  (description=STRING)?
  name = QName (title = STRING)?
  (tags += Tag)*
  (imports += Import)*
  (types += TypeDef)*;

Import:
  'import' namespace = [Namespace:QName];

Name returns string: (ID | STRING);

QName returns string:
  Name ('.' Name)*;

TypeDef: BuiltinType | CompositeType | EnumType;

CompositeType:
  (isAbstract ?= 'abstract')?
  kind = ('datatype' | 'layer')
  (description=STRING)?
  name = Name (title = STRING)?
  ('extends' extends = [CompositeType:QName])?
  (tags += Tag)*
  '{'
    (properties += Property)*
  '}'
  ;

PropertyKind returns string: ('geometry' | 'identity' | 'parent' | 'child');

PropertyType: TypeDef | TypeRef;

TypeRef: typeRef = [TypeDef:QName];

Property:
  (description=STRING)?
  (kind = PropertyKind)?
  name = Name (title = STRING)?
  (multiplicity = Multiplicity)?
  ':'
  type = PropertyType
  ('=' defaultValue = LiteralValue)?
  (tags += Tag)*
  ;

Multiplicity: ZeroOrMoreMultiplicity | OneOrMoreMultiplicity | ZeroOrOneMultiplicity | SomeMultiplicity;

ZeroOrMoreMultiplicity: spec = '*';
OneOrMoreMultiplicity: spec = '+';
ZeroOrOneMultiplicity: spec = '?';
SomeMultiplicity: '[' lower = IntLiteral ('..' (upper = IntLiteral)?) ']';

BuiltinType:
  'builtin'
  (description = STRING)?
  name = Name (title = STRING)?
  ('(' (params += BuiltinParam (',' params += BuiltinParam)*)? ')')?
  (tags += Tag)*
  ;

BuiltinParam: name = Name ('!'? | ('=' value = BuiltinParamValue));

BuiltinParamValue: StringValue | DecimalValue | IntValue | NameValue;

EnumType:
  'codelist'
  (description = STRING)?
  (tags += Tag)*
  name = Name (title = STRING)?
  '{'
    (properties += EnumProperty)+
  '}'
  ;

EnumProperty:
  (description = STRING)?
  name = Name (title = STRING)?
  ('=' value = EnumValue)?
  (tags += Tag)*
  ;

EnumValue: StringValue | IntValue | NameValue;

Tag: name = '$' QName ('!'? | ('=' value = LiteralValue));

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
