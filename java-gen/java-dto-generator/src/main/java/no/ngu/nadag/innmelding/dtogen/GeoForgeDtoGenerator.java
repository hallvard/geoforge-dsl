package no.ngu.nadag.innmelding.dtogen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.palantir.javapoet.AnnotationSpec;
import com.palantir.javapoet.ClassName;
import com.palantir.javapoet.FieldSpec;
import com.palantir.javapoet.JavaFile;
import com.palantir.javapoet.MethodSpec;
import com.palantir.javapoet.ParameterSpec;
import com.palantir.javapoet.ParameterizedTypeName;
import com.palantir.javapoet.TypeName;
import com.palantir.javapoet.TypeSpec;
import geoforge.model.GeoForge;
import geoforge.model.GeoForge.BuiltinType;
import geoforge.model.GeoForge.CodeListType;
import geoforge.model.GeoForge.CompositeType;
import geoforge.model.GeoForge.CompositeTypeProperty;
import geoforge.model.GeoForge.DataType;
import geoforge.model.GeoForge.GeoForgeType;
import geoforge.model.GeoForge.LayerType;
import geoforge.model.GeoForge.ModelElement;
import geoforge.model.GeoForge.Namespace;
import geoforge.model.GeoForge.TypeRef;
import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import jakarta.json.bind.annotation.JsonbDateFormat;
import jakarta.json.bind.annotation.JsonbSubtype;
import jakarta.json.bind.annotation.JsonbTypeAdapter;
import jakarta.json.bind.annotation.JsonbTypeInfo;
import javax.lang.model.element.Modifier;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.media.SchemaProperty;

/**
 * Generates Java DTOs directly from a GeoForge model.
 */
public class GeoForgeDtoGenerator {

  private final ObjectMapper objectMapper = new ObjectMapper();
  private final JavaNaming naming = new DtoNaming();
  private final Map<String, TypeName> configuredBuiltinTypeMappings = new HashMap<>();

  private final String basePackage;
  private final Map<String, String> externalBuiltinTypeMappings;
  private final Map<String, ClassName> generatedClassNames = new LinkedHashMap<>();
  private final Map<String, TypeName> resolvedTypeNames = new HashMap<>();
  private final Map<String, List<String>> subtypes = new HashMap<>();
  private final Set<String> concreteSubtypeNames = new java.util.HashSet<>();

  private static final String JSONB_TYPE_KEY = "jsonType";
  private static final ClassName LIST_CLASS = ClassName.get("java.util", "List");
  private static final TypeName ZONED_DATETIME_TYPE = TypeName.get(ZonedDateTime.class);

  public GeoForgeDtoGenerator(String basePackage) {
    this(basePackage, Map.of());
  }

  public GeoForgeDtoGenerator(String basePackage, Map<String, String> builtinTypeMappings) {
    this.basePackage = (basePackage == null || basePackage.isBlank()) ? "generated" : basePackage;
    this.externalBuiltinTypeMappings = builtinTypeMappings == null ? Map.of() : Map.copyOf(builtinTypeMappings);
  }

  public Namespace readModel(Path modelFile) {
    try {
      return objectMapper.readValue(modelFile.toFile(), GeoForge.Namespace.class);
    } catch (IOException e) {
      throw new IllegalStateException("Failed to read GeoForge model from " + modelFile, e);
    }
  }

  public void writeFromJson(Path modelFile, Path outputDirectory) {
    var model = readModel(modelFile);
    configureBuiltinTypeMappings(model, modelFile.getParent(), externalBuiltinTypeMappings);
    writeFromModel(model, outputDirectory);
  }

  public void writeFromModel(Namespace model, Path outputDirectory) {
    if (configuredBuiltinTypeMappings.isEmpty()) {
      configureBuiltinTypeMappings(model, null, externalBuiltinTypeMappings);
    }
    registerTypeNames(model);
    registerSubtypes(model);
    for (var type : model.types()) {
      if (type instanceof BuiltinType) {
        continue;
      }
      writeType(outputDirectory, type);
    }
  }

  private void registerTypeNames(Namespace model) {
    generatedClassNames.clear();
    resolvedTypeNames.clear();

    for (var type : model.types()) {
      var qName = qNameString(type.name());
      if (type instanceof BuiltinType builtinType) {
        resolvedTypeNames.put(qName, builtinToJavaType(builtinType));
      } else {
        var className = classNameFor(type.name());
        generatedClassNames.put(qName, className);
        resolvedTypeNames.put(qName, className);
      }
    }
  }

  private void registerSubtypes(Namespace model) {
    subtypes.clear();
    concreteSubtypeNames.clear();
    for (var type : model.types()) {
      if (!(type instanceof CompositeType<?> compositeType)) {
        continue;
      }
      if (compositeType.superType() == null) {
        continue;
      }
      var parentName = qNameString(compositeType.superType().qName());
      var childName = qNameString(type.name());
      subtypes.computeIfAbsent(parentName, key -> new ArrayList<>()).add(childName);
      if (!compositeType.isAbstract()) {
        concreteSubtypeNames.add(childName);
      }
    }
  }

  private void writeType(Path outputDirectory, GeoForgeType type) {
    var className = generatedClassNames.get(qNameString(type.name()));
    if (className == null) {
      throw new IllegalStateException("Missing class name for type " + qNameString(type.name()));
    }

    TypeSpec generatedType;
    if (type instanceof CodeListType codeListType) {
      generatedType = generateCodeListType(codeListType, className.simpleName());
    } else if (type instanceof DataType dataType) {
      generatedType = generateCompositeType(dataType, className.simpleName());
    } else if (type instanceof LayerType layerType) {
      generatedType = generateCompositeType(layerType, className.simpleName());
    } else {
      throw new IllegalArgumentException("Unsupported GeoForge type: " + type.getClass());
    }

    var file = JavaFile.builder(className.packageName(), generatedType).build();
    try {
      file.writeTo(outputDirectory);
    } catch (IOException e) {
      throw new IllegalStateException("Failed to write generated type " + className, e);
    }
  }

  private TypeSpec generateCodeListType(CodeListType codeListType, String className) {
    var builder = TypeSpec.enumBuilder(className)
        .addModifiers(Modifier.PUBLIC)
        .addSuperinterface(ClassName.get(basePackage, "CodeListItem"));

    addTypeSchemaAnnotation(builder, codeListType, qNameString(codeListType.name()), false);
    addJsonbAdapterAnnotation(builder, className);

    var labelField = FieldSpec.builder(String.class, "label", Modifier.PRIVATE, Modifier.FINAL).build();
    builder.addField(labelField)
        .addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PRIVATE)
            .addParameter(String.class, "label")
            .addStatement("this.label = label")
            .build())
        .addMethod(MethodSpec.methodBuilder("getLabel")
            .addAnnotation(Override.class)
            .addModifiers(Modifier.PUBLIC)
            .returns(String.class)
            .addStatement("return this.label")
            .build());

    for (var item : codeListType.items()) {
      var constantName = naming.toConstantMemberName(item.simpleName());
      var constantLabel = item.value() != null ? item.value() : item.simpleName();
      builder.addEnumConstant(constantName,
          TypeSpec.anonymousClassBuilder("$S", constantLabel).build());
    }

    return builder.build();
  }

  private TypeSpec generateCompositeType(CompositeType<?> compositeType, String className) {
    if (compositeType instanceof DataType dataType
        && !dataType.isAbstract()
        && dataType.superType() == null) {
      return generateRecordDataType(dataType, className);
    }

    var qName = qNameString(compositeType.name());
    var builder = TypeSpec.classBuilder(className)
        .addModifiers(Modifier.PUBLIC)
        .addMethod(MethodSpec.constructorBuilder()
            .addModifiers(compositeType.isAbstract() ? Modifier.PROTECTED : Modifier.PUBLIC)
            .build());

    addTypeSchemaAnnotation(builder, compositeType, qName, compositeType.isAbstract());
    addJsonbTypeInfoAnnotation(builder, qName, compositeType.isAbstract());

    if (compositeType.isAbstract()) {
      builder.addModifiers(Modifier.ABSTRACT);
    }

    if (compositeType.superType() != null) {
      builder.superclass(typeForReference(compositeType.superType()));
    }

    for (var property : compositeType.properties()) {
      var memberName = naming.toMemberName(property.simpleName());
      var fieldType = typeForProperty(property);
      var fieldBuilder = FieldSpec.builder(fieldType, memberName, Modifier.PRIVATE);
      addPropertySchemaAnnotation(fieldBuilder, property);
      var field = fieldBuilder.build();
      builder.addField(field);
      builder.addMethod(getterForField(field, property));
      builder.addMethod(setterForField(field));
    }

    return builder.build();
  }

  private TypeSpec generateRecordDataType(DataType dataType, String className) {
    var builder = TypeSpec.recordBuilder(className).addModifiers(Modifier.PUBLIC);
    addTypeSchemaAnnotation(builder, dataType, qNameString(dataType.name()), false);
    var constructor = MethodSpec.constructorBuilder();
    var zonedDateTimeMembers = new ArrayList<String>();

    for (var property : dataType.properties()) {
      var fieldType = typeForProperty(property);
      var memberName = naming.toMemberName(property.simpleName());
      var parameterBuilder = ParameterSpec.builder(fieldType, memberName);
      addPropertySchemaAnnotation(parameterBuilder, property);
      constructor.addParameter(parameterBuilder.build());
      if (fieldType.equals(ZONED_DATETIME_TYPE)) {
        zonedDateTimeMembers.add(memberName);
      }
    }

    builder.recordConstructor(constructor.build());
    for (var memberName : zonedDateTimeMembers) {
      builder.addMethod(MethodSpec.methodBuilder(memberName)
          .addModifiers(Modifier.PUBLIC)
          .returns(ZONED_DATETIME_TYPE)
          .addAnnotation(Override.class)
          .addAnnotation(AnnotationSpec.builder(JsonbDateFormat.class)
              .addMember("value", "$S", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
              .build())
          .addStatement("return this.$L", memberName)
          .build());
    }
    return builder.build();
  }

  private MethodSpec getterForField(FieldSpec field, CompositeTypeProperty property) {
    var builder = MethodSpec.methodBuilder(naming.toGetterName(field))
        .addModifiers(Modifier.PUBLIC)
        .returns(field.type())
        .addStatement("return this." + field.name());

    addPropertySchemaAnnotation(builder, property);
    if (field.type().equals(ZONED_DATETIME_TYPE)) {
      builder.addAnnotation(AnnotationSpec.builder(JsonbDateFormat.class)
          .addMember("value", "$S", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
          .build());
    }

    return builder.build();
  }

  private MethodSpec setterForField(FieldSpec field) {
    return MethodSpec.methodBuilder(naming.toSetterName(field))
        .addModifiers(Modifier.PUBLIC)
        .returns(void.class)
        .addParameter(field.type(), field.name())
        .addStatement("this." + field.name() + " = " + field.name())
        .build();
  }

  private TypeName typeForProperty(CompositeTypeProperty property) {
    var baseType = typeForReference(property.type());
    if (isMany(property)) {
      return ParameterizedTypeName.get(LIST_CLASS, boxIfNeeded(baseType));
    }
    if (isOptional(property)) {
      return boxIfNeeded(baseType);
    }
    return baseType;
  }

  private TypeName typeForReference(TypeRef<?> ref) {
    var qName = qNameString(ref.qName());
    var resolved = resolvedTypeNames.get(qName);
    if (resolved != null) {
      return resolved;
    }

    if (qName.startsWith("geoforge.lib.")) {
      return builtinToJavaType(ref.qName().get(ref.qName().size() - 1));
    }

    var className = classNameFor(ref.qName());
    resolvedTypeNames.put(qName, className);
    return className;
  }

  private TypeName builtinToJavaType(BuiltinType type) {
    return builtinToJavaType(type.simpleName());
  }

  private TypeName builtinToJavaType(String builtinName) {
    var configured = configuredBuiltinTypeMappings.get(builtinName);
    if (configured != null) {
      return configured;
    }
    return ClassName.get("geoforge.lib", naming.toJavaClassName(builtinName));
  }

  private void configureBuiltinTypeMappings(Namespace model, Path modelDirectory, Map<String, String> explicitMappings) {
    configuredBuiltinTypeMappings.clear();

    if (explicitMappings != null && !explicitMappings.isEmpty()) {
      applyBuiltinTypeMappings(explicitMappings);
      return;
    }

    var mappingFile = model.tags().stream()
        .filter(tag -> "javaTypeMappingsFile".equals(tag.name()))
        .map(tag -> tag.value() != null ? tag.value().toString() : null)
        .filter(value -> value != null && !value.isBlank())
        .findFirst();
    if (mappingFile.isEmpty()) {
      return;
    }

    var mappingPath = resolveMappingPath(mappingFile.get(), modelDirectory);
    try {
      var root = objectMapper.readTree(mappingPath.toFile());
      var mappingsNode = root.has("builtinTypeMappings") ? root.get("builtinTypeMappings") : root;
      if (mappingsNode == null || !mappingsNode.isObject()) {
        throw new IllegalArgumentException("Expected JSON object with builtin type mappings in " + mappingPath);
      }
      var fileMappings = new LinkedHashMap<String, String>();
      var fields = mappingsNode.fields();
      while (fields.hasNext()) {
        var entry = fields.next();
        if (entry.getValue().isTextual()) {
          fileMappings.put(entry.getKey(), entry.getValue().asText());
        }
      }
      applyBuiltinTypeMappings(fileMappings);
    } catch (IOException e) {
      throw new IllegalStateException("Failed to read Java type mappings from " + mappingPath, e);
    }
  }

  private void applyBuiltinTypeMappings(Map<String, String> mappings) {
    for (var entry : mappings.entrySet()) {
      if (entry.getValue() == null || entry.getValue().isBlank()) {
        continue;
      }
      configuredBuiltinTypeMappings.put(entry.getKey(), parseJavaType(entry.getValue()));
    }
  }

  private static Path resolveMappingPath(String configuredPath, Path modelDirectory) {
    var candidate = Path.of(configuredPath);
    if (candidate.isAbsolute() && java.nio.file.Files.exists(candidate)) {
      return candidate;
    }
    if (modelDirectory != null) {
      var relativeToModel = modelDirectory.resolve(configuredPath).normalize();
      if (java.nio.file.Files.exists(relativeToModel)) {
        return relativeToModel;
      }
    }
    if (java.nio.file.Files.exists(candidate)) {
      return candidate;
    }
    throw new IllegalStateException("Java type mappings file not found: " + configuredPath);
  }

  private static TypeName parseJavaType(String javaType) {
    var value = javaType.trim();
    return switch (value) {
      case "boolean" -> TypeName.BOOLEAN;
      case "byte" -> TypeName.BYTE;
      case "short" -> TypeName.SHORT;
      case "int" -> TypeName.INT;
      case "long" -> TypeName.LONG;
      case "float" -> TypeName.FLOAT;
      case "double" -> TypeName.DOUBLE;
      case "char" -> TypeName.CHAR;
      case "String", "java.lang.String" -> TypeName.get(String.class);
      case "LocalDate", "java.time.LocalDate" -> TypeName.get(LocalDate.class);
      case "ZonedDateTime", "java.time.ZonedDateTime" -> TypeName.get(ZonedDateTime.class);
      default -> {
        var separator = value.lastIndexOf('.');
        if (separator > 0 && separator < value.length() - 1) {
          yield ClassName.get(value.substring(0, separator), value.substring(separator + 1));
        }
        yield ClassName.get("geoforge.lib", value);
      }
    };
  }

  private void addJsonbAdapterAnnotation(TypeSpec.Builder builder, String className) {
    var adapterTypeName = ClassName.get("", className, "JsonbAdapter");
    builder.addAnnotation(AnnotationSpec.builder(JsonbTypeAdapter.class)
        .addMember("value", "$T.class", adapterTypeName)
        .build());

    var baseAdapterType = ParameterizedTypeName.get(
        ClassName.get(basePackage, "CodeListItem", "AbstractJsonbAdapter"),
        ClassName.get("", className));
    var adapterType = TypeSpec.classBuilder("JsonbAdapter")
        .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
        .superclass(baseAdapterType)
        .addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PUBLIC)
            .addStatement("super($T.class)", ClassName.get("", className))
            .build())
        .build();
    builder.addType(adapterType);
  }

  private void addJsonbTypeInfoAnnotation(TypeSpec.Builder builder, String qName, boolean isAbstract) {
    if (!isAbstract) {
      return;
    }
    var children = concreteChildrenOf(qName);
    if (children.isEmpty()) {
      return;
    }
    var annotationBuilder = AnnotationSpec.builder(JsonbTypeInfo.class)
        .addMember("key", "$S", JSONB_TYPE_KEY);
    for (var child : children) {
      annotationBuilder.addMember("value", "$L", AnnotationSpec.builder(JsonbSubtype.class)
          .addMember("type", "$T.class", child)
          .addMember("alias", "$S", child.simpleName())
          .build());
    }
    builder.addAnnotation(annotationBuilder.build());
  }

  private void addTypeSchemaAnnotation(TypeSpec.Builder builder, ModelElement element,
      String qName, boolean isAbstract) {
    var annotationBuilder = AnnotationSpec.builder(Schema.class)
        .addMember("name", "$S", naming.toJavaClassName(element.simpleName()));

    if (element.description() != null && !element.description().isBlank()) {
      annotationBuilder.addMember("description", "$S", element.description());
    }

    if (isAbstract) {
      var children = concreteChildrenOf(qName);
      if (!children.isEmpty()) {
        for (var child : children) {
          annotationBuilder.addMember("oneOf", "$T.class", child);
        }
        annotationBuilder.addMember("discriminatorProperty", "$S", JSONB_TYPE_KEY);
      }
    } else if (concreteSubtypeNames.contains(qName)) {
      annotationBuilder.addMember("properties", "$L", AnnotationSpec.builder(SchemaProperty.class)
          .addMember("name", "$S", JSONB_TYPE_KEY)
          .addMember("constValue", "$S", naming.toJavaClassName(element.simpleName()))
          .build());
    }

    builder.addAnnotation(annotationBuilder.build());
  }

  private List<ClassName> concreteChildrenOf(String qName) {
    return allConcreteDescendantsOf(qName).stream()
        .map(generatedClassNames::get)
        .filter(java.util.Objects::nonNull)
        .sorted(Comparator.comparing(ClassName::canonicalName))
        .collect(Collectors.toList());
  }

  private Set<String> allConcreteDescendantsOf(String qName) {
    var found = new java.util.LinkedHashSet<String>();
    collectConcreteDescendants(qName, found, new java.util.HashSet<>());
    return found;
  }

  private void collectConcreteDescendants(String qName, Set<String> found, Set<String> visiting) {
    if (!visiting.add(qName)) {
      return;
    }
    for (var child : subtypes.getOrDefault(qName, List.of())) {
      if (concreteSubtypeNames.contains(child)) {
        found.add(child);
      }
      collectConcreteDescendants(child, found, visiting);
    }
    visiting.remove(qName);
  }

  private void addPropertySchemaAnnotation(FieldSpec.Builder builder, CompositeTypeProperty property) {
    var annotationBuilder = AnnotationSpec.builder(Schema.class)
        .addMember("name", "$S", property.simpleName());
    if (property.description() != null && !property.description().isBlank()) {
      annotationBuilder.addMember("description", "$S", property.description());
    }
    builder.addAnnotation(annotationBuilder.build());
  }

  private void addPropertySchemaAnnotation(MethodSpec.Builder builder, CompositeTypeProperty property) {
    var annotationBuilder = AnnotationSpec.builder(Schema.class)
        .addMember("name", "$S", property.simpleName());
    if (property.description() != null && !property.description().isBlank()) {
      annotationBuilder.addMember("description", "$S", property.description());
    }
    builder.addAnnotation(annotationBuilder.build());
  }

  private void addPropertySchemaAnnotation(ParameterSpec.Builder builder, CompositeTypeProperty property) {
    var annotationBuilder = AnnotationSpec.builder(Schema.class)
        .addMember("name", "$S", property.simpleName());
    if (property.description() != null && !property.description().isBlank()) {
      annotationBuilder.addMember("description", "$S", property.description());
    }
    builder.addAnnotation(annotationBuilder.build());
  }

  private ClassName classNameFor(List<String> qName) {
    var simpleName = naming.toJavaClassName(qName.get(qName.size() - 1));
    var packageName = packageNameFor(qName);
    return ClassName.get(packageName, simpleName);
  }

  private String packageNameFor(List<String> qName) {
    if (qName.size() <= 1) {
      return basePackage;
    }

    var segments = new ArrayList<String>();
    if (basePackage != null && !basePackage.isBlank()) {
      segments.add(basePackage);
    }
    for (int i = 0; i < qName.size() - 1; i++) {
      segments.add(naming.toJavaPackageName(qName.get(i)));
    }
    return String.join(".", segments);
  }

  private static TypeName boxIfNeeded(TypeName typeName) {
    return typeName.isPrimitive() ? typeName.box() : typeName;
  }

  private static boolean isOptional(CompositeTypeProperty property) {
    var multiplicity = property.multiplicity();
    return multiplicity != null && multiplicity.lower() == 0;
  }

  private static boolean isMany(CompositeTypeProperty property) {
    var multiplicity = property.multiplicity();
    return multiplicity != null && (multiplicity.upper() < 0 || multiplicity.upper() > 1);
  }

  private static String qNameString(List<String> qName) {
    return String.join(".", qName);
  }
}
