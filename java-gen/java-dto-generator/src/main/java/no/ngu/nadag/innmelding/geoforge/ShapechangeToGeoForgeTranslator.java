package no.ngu.nadag.innmelding.geoforge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import de.interactive_instruments.ShapeChange.Model.ClassInfo;
import de.interactive_instruments.ShapeChange.Model.Info;
import de.interactive_instruments.ShapeChange.Model.Model;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;
import geoforge.model.GeoForge;
import geoforge.model.GeoForge.BuiltinType;
import geoforge.model.GeoForge.CodeListItem;
import geoforge.model.GeoForge.CodeListType;
import geoforge.model.GeoForge.CompositeTypeProperty;
import geoforge.model.GeoForge.CompositeTypeProperty.Kind;
import geoforge.model.GeoForge.DataType;
import geoforge.model.GeoForge.GeoForgeType;
import geoforge.model.GeoForge.LayerType;
import geoforge.model.GeoForge.ModelElementInfo;
import geoforge.model.GeoForge.Multiplicity;
import geoforge.model.GeoForge.SimpleValue;
import geoforge.model.GeoForge.Tag;
import geoforge.model.GeoForge.TypeRef;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import no.ngu.nadag.innmelding.dtogen.AbstractGenerator;
import no.ngu.nadag.innmelding.dtogen.DtoNaming;
import no.ngu.nadag.innmelding.dtogen.JavaNaming;

/**
 * Translates ShapeChange classes to GeoForge model objects.
 */
public class ShapechangeToGeoForgeTranslator extends AbstractGenerator<GeoForgeType> {

  private static final String GEOFORGE_LIB_PREFIX = "geoforge.lib.";

  private final ObjectMapper objectMapper = new ObjectMapper()
      .enable(SerializationFeature.INDENT_OUTPUT);

  private final Map<String, BuiltinType> builtinTypes = new LinkedHashMap<>();
  private final Set<ClassInfo> inProgress = new HashSet<>();
  private final List<String> namePrefix;
  private final String tagPrefix;
  private final String javaTypeMappingsFile;
  private final JavaNaming naming = new DtoNaming();

  public ShapechangeToGeoForgeTranslator(Model model, String namePrefix, String tagPrefix,
      String javaTypeMappingsFile) {
    super(model);
    this.namePrefix = toQNameSegments(namePrefix);
    this.tagPrefix = tagPrefix;
    this.javaTypeMappingsFile = javaTypeMappingsFile;
  }

  public void writeModel(Path outputFile, String modelName) {
    var geoForgeModel = buildModel(modelName);
    try {
      var parent = outputFile.getParent();
      if (parent != null) {
        Files.createDirectories(parent);
      }
      objectMapper.writeValue(outputFile.toFile(), geoForgeModel);
    } catch (IOException e) {
      throw new IllegalStateException("Failed to write GeoForge model to " + outputFile, e);
    }
  }

  private GeoForge.Model buildModel(String modelName) {
    var modelInfo = new ModelElementInfo(toQNameSegments(modelName), null, null);
    var geoForgeModel = new GeoForge.Model(modelInfo);
    if (javaTypeMappingsFile != null && !javaTypeMappingsFile.isBlank()) {
      geoForgeModel.tags().add(Tag.of("javaTypeMappingsFile", javaTypeMappingsFile));
    }
    var classTypes = generated.values().stream()
        .sorted(Comparator.comparing(GeoForgeType::nameString))
        .toList();
    var builtin = builtinTypes.values().stream()
        .sorted(Comparator.comparing(BuiltinType::nameString))
        .toList();
    for (var type : builtin) {
      geoForgeModel.addType(type);
    }
    for (var type : classTypes) {
      geoForgeModel.addType(type);
    }
    return geoForgeModel;
  }

  @Override
  protected void generateForCodeList(ClassInfo classInfo) {
    var items = classInfo.properties().values().stream()
        .map(this::toCodeListItem)
        .collect(Collectors.toCollection(ArrayList::new));
    var codeListType = new CodeListType(infoForClass(classInfo), items);
    addTags(classInfo, codeListType.tags());
    registerGenerated(classInfo, codeListType);
  }

  @Override
  protected void generateForDataType(ClassInfo classInfo) {
    var superRef = resolveDataTypeSuperRef(classInfo.supertypeClasses());
    var dataType = new DataType(infoForClass(classInfo), classInfo.isAbstract(), superRef,
        toProperties(classInfo));
    addTags(classInfo, dataType.tags());
    registerGenerated(classInfo, dataType);
  }

  @Override
  protected void generateForFeatureType(ClassInfo classInfo) {
    var superRef = resolveLayerTypeSuperRef(classInfo.supertypeClasses());
    var layerType = new LayerType(infoForClass(classInfo), classInfo.isAbstract(), superRef,
        toProperties(classInfo));
    addTags(classInfo, layerType.tags());
    registerGenerated(classInfo, layerType);
  }

  private TypeRef<DataType> resolveDataTypeSuperRef(Set<ClassInfo> superTypes) {
    for (var superType : superTypes) {
      if (isDatatype(superType)) {
        ensureGenerated(superType);
        var type = generated.get(superType);
        if (type instanceof DataType dataType) {
          var ref = new TypeRef<DataType>(dataType.nameString());
          ref.setElement(dataType);
          return ref;
        }
      }
    }
    return null;
  }

  private TypeRef<LayerType> resolveLayerTypeSuperRef(Set<ClassInfo> superTypes) {
    for (var superType : superTypes) {
      if (isFeaturetype(superType)) {
        ensureGenerated(superType);
        var type = generated.get(superType);
        if (type instanceof LayerType layerType) {
          var ref = new TypeRef<LayerType>(layerType.nameString());
          ref.setElement(layerType);
          return ref;
        }
      }
    }
    return null;
  }

  private void ensureGenerated(ClassInfo classInfo) {
    if (classInfo == null || isGenerated(classInfo) || inProgress.contains(classInfo)) {
      return;
    }
    inProgress.add(classInfo);
    try {
      generateFor(classInfo);
    } finally {
      inProgress.remove(classInfo);
    }
  }

  private List<CompositeTypeProperty> toProperties(ClassInfo classInfo) {
    var ownedProps = ownedProperties.getOrDefault(classInfo, List.of());
    var ownerProps = ownerProperties.getOrDefault(classInfo, List.of());
    var properties = new ArrayList<CompositeTypeProperty>();
    for (var prop : classInfo.properties().values()) {
      var type = toTypeRef(prop);
      var kind = propertyKind(prop, ownedProps, ownerProps, type);
      var property = new CompositeTypeProperty(
          infoForProperty(prop),
          kind,
          type,
          toMultiplicity(prop),
          SimpleValue.of(prop.initialValue())
      );
      addTags(prop, property.tags());
      properties.add(property);
    }
    return properties;
  }

  private Kind propertyKind(PropertyInfo prop, Collection<PropertyInfo> ownedProps,
      Collection<PropertyInfo> ownerProps, TypeRef<GeoForgeType> typeRef) {
    if (isIdentityProperty(prop)) {
      return Kind.ID;
    }
    if (isGeometryProperty(prop)) {
      return Kind.GEOMETRY;
    }
    if (ownedProps.contains(prop)) {
      return Kind.CONTAINER;
    }
    if (prop.isComposition() || prop.isAggregation() || ownerProps.contains(prop)) {
      if (isLayerTypeReference(prop, typeRef)) {
        return Kind.CONTAINMENT;
      }
      return null;
    }
    return null;
  }

  private boolean isLayerTypeReference(PropertyInfo prop, TypeRef<GeoForgeType> typeRef) {
    var referenced = typeRef.element();
    if (referenced instanceof LayerType) {
      return true;
    }
    var typeClass = prop.typeClass();
    return typeClass != null && isFeaturetype(typeClass);
  }

  private boolean isIdentityProperty(PropertyInfo prop) {
    return prop.stereotype("sosiPrimærnøkkel")
        || "true".equalsIgnoreCase(prop.taggedValue("SOSI_primærnøkkel"));
  }

  private static boolean isGeometryProperty(PropertyInfo prop) {
    var type = prop.typeInfo();
    return type != null
        && ("Punkt".equals(type.name)
            || "Kurve".equals(type.name)
            || "Flate".equals(type.name)
            || "GM_Surface".equals(type.name)
            || "GM_MultiSurface".equals(type.name));
  }

  private TypeRef<GeoForgeType> toTypeRef(PropertyInfo prop) {
    GeoForgeType type = null;
    var typeClass = prop.typeClass();
    if (typeClass != null) {
      if (inProgress.contains(typeClass)) {
        return new TypeRef<GeoForgeType>(qualifiedName(typeClass));
      }
      ensureGenerated(typeClass);
      type = generated.get(typeClass);
      if (type == null) {
        return new TypeRef<GeoForgeType>(qualifiedName(typeClass));
      }
    }
    if (type == null && prop.typeInfo() != null) {
      type = resolveBuiltinType(prop.typeInfo().name);
    }
    if (type == null) {
      type = resolveBuiltinType("CharacterString");
    }
    var ref = new TypeRef<GeoForgeType>(type.nameString());
    ref.setElement(type);
    return ref;
  }

  private String qualifiedName(Info info) {
    if (info instanceof ClassInfo classInfo) {
      return String.join(".", toQualifiedTypeName(classInfo));
    }
    return String.join(".", toQNameSegments(info.name()));
  }

  private BuiltinType resolveBuiltinType(String shapechangeTypeName) {
    var qualifiedName = GEOFORGE_LIB_PREFIX + shapechangeTypeName;
    var existing = builtinTypes.get(qualifiedName);
    if (existing != null) {
      return existing;
    }
    var created = new BuiltinType(new ModelElementInfo(qualifiedName));
    builtinTypes.put(qualifiedName, created);
    return created;
  }

  private Multiplicity toMultiplicity(PropertyInfo prop) {
    var card = prop.cardinality();
    return new Multiplicity(card.minOccurs, normalizeUpperBound(card.maxOccurs));
  }

  private static int normalizeUpperBound(int maxOccurs) {
    if (maxOccurs < 0 || maxOccurs == Integer.MAX_VALUE) {
      return -1;
    }
    return maxOccurs;
  }

  private CodeListItem toCodeListItem(PropertyInfo prop) {
    var value = prop.initialValue() != null ? prop.initialValue() : prop.name();
    var item = new CodeListItem(infoForProperty(prop), value);
    addTags(prop, item.tags());
    return item;
  }

  private ModelElementInfo infoForClass(ClassInfo info) {
    var name = toQualifiedTypeName(info);
    var title = trimToNull(info.aliasName());
    var description = trimToNull(firstNonBlank(info.documentation(), info.description()));
    return new ModelElementInfo(name, title, description);
  }

  private ModelElementInfo infoForProperty(PropertyInfo info) {
    var name = toSafePropertyName(info.name());
    var title = trimToNull(info.aliasName());
    var description = trimToNull(firstNonBlank(info.documentation(), info.description()));
    return new ModelElementInfo(name, title, description);
  }

  private List<String> toQualifiedTypeName(ClassInfo info) {
    var raw = info.fullName() != null ? info.fullName() : info.name();
    var source = toQNameSegments(raw);
    var className = source.isEmpty()
        ? naming.toJavaClassName("unnamed")
        : naming.toJavaClassName(source.get(source.size() - 1));

    var qualified = new ArrayList<String>();
    qualified.addAll(toSafePackageSegments(namePrefix));
    if (source.size() > 1) {
      qualified.add(naming.toJavaPackageName(source.get(source.size() - 2)));
    }
    qualified.add(className);
    return qualified;
  }

  private List<String> toSafePackageSegments(List<String> segments) {
    return segments.stream()
        .map(naming::toJavaPackageName)
        .toList();
  }

  private List<String> toSafePropertyName(String rawName) {
    if (rawName == null || rawName.isBlank()) {
      return List.of(naming.toMemberName("unnamed"));
    }
    return List.of(naming.toMemberName(rawName));
  }

  private static String firstNonBlank(String first, String second) {
    if (first != null && !first.isBlank()) {
      return first;
    }
    return second;
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    var trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private List<String> toQNameSegments(String rawName) {
    if (rawName == null || rawName.isBlank()) {
      return List.of("unnamed");
    }
    var normalized = rawName
        .replace("::", ".")
        .replace('/', '.')
        .replace(':', '.');
    return List.of(normalized.split("\\."))
        .stream()
        .map(String::trim)
        .filter(s -> !s.isBlank())
        .toList();
  }

  private void addTags(Info info, List<Tag> tags) {
    if (tagPrefix == null || tagPrefix.isBlank()) {
      return;
    }
    for (var entry : info.taggedValues().entrySet()) {
      if (!entry.getKey().startsWith(tagPrefix)) {
        continue;
      }
      var value = entry.getValue();
      if (value != null && !value.isBlank()) {
        tags.add(Tag.of(entry.getKey(), value));
      }
    }
  }
}