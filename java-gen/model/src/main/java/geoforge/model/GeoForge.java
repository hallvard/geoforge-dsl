package geoforge.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class GeoForge {

  public record QName(List<String> segments) {
  
    @JsonCreator
    public QName(String nameString) {
      this(List.of(nameString.split("\\.")));
    }

    public String nameString() {
      return String.join(".", segments);
    }

    public String simpleName() {
      return segments.getLast();
    }
  }

  public record ModelElementInfo(QName name, String title, String description, List<Tag> tags) {

    public ModelElementInfo(List<String> name, String title, String description) {
      this(new QName(name), title, description, new ArrayList<>());
    }
    
    public ModelElementInfo(String name, String title, String description) {
      this(new QName(name), title, description, new ArrayList<>());
    }

    public ModelElementInfo(String name) {
      this(new QName(name), null, null, new ArrayList<>());
    }

    public String nameString() {
      return name.nameString();
    }

    public String simpleName() {
      return name.simpleName();
    }
  }


  public interface SimpleValue {

    public record StringValue(String stringVlue) implements SimpleValue {
      public String value() {
        return stringVlue;
      }
    }

    public record IntValue(int intValue) implements SimpleValue {
      public String value() {
        return String.valueOf(intValue);
      }
    }

    public record BooleanValue(boolean booleanValue) implements SimpleValue {
      public String value() {
        return String.valueOf(booleanValue);
      }
    }

    public record DecimalValue(double decimalValue) implements SimpleValue {
      public String value() {
        return String.valueOf(decimalValue);
      }
    }

    public String value();

    public static SimpleValue of(Object value) {
      return switch (value) {
        case String s -> new StringValue(s);
        case Integer i -> new IntValue(i);
        case Boolean b -> new BooleanValue(b);
        case Double d -> new DecimalValue(d);
        default -> throw new IllegalArgumentException("Unsupported value type: " + value.getClass());
      };
    }

    public static SimpleValue of(String value) {
      if (value == null) {
        return null;
      }
      try {
        return new IntValue(Integer.valueOf(value));
      } catch (NumberFormatException e) {
      }
      try {
        return new DecimalValue(Double.valueOf(value));
      } catch (NumberFormatException e) {
      }
      if (value.equalsIgnoreCase("true") || value.equalsIgnoreCase("false")) {
        return new BooleanValue(Boolean.valueOf(value));
      }
      return new StringValue(value);
    }
  }

  public record Tag(
      String name,
      @JsonIgnore
      SimpleValue simpleValue
  ) {
    @JsonCreator
    public static Tag of(
        @JsonProperty("name") String name,
        @JsonProperty("value") String value
    ) {
      return new Tag(name, SimpleValue.of(value));
    }

    @JsonProperty("value")
    public String value() {
      return simpleValue.value();
    }
  }

  public static abstract class ModelElement {

    private final ModelElementInfo info;

    public ModelElement(ModelElementInfo info) {
      this.info = info;
    }

    @JsonProperty("name")
    public List<String> name() {
      return info.name().segments();
    }

    @JsonProperty("title")
    public String title() {
      return info.title();
    }

    @JsonProperty("description")
    public String description() {
      return info.description();
    }

    @JsonProperty("tags")
    public List<Tag> tags() {
      return info.tags();
    }

    @JsonIgnore
    public ModelElementInfo info() {
      return info;
    }
    
    @JsonIgnore
    public String nameString() {
      return info.nameString();
    }
    
    @JsonIgnore
    public String simpleName() {
      return info.simpleName();
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "entityType")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = Model.class, name = "model"),
    @JsonSubTypes.Type(value = Package.class, name = "package")
  })
  public static class Namespace extends ModelElement {

    private final List<GeoForgeType> types;

    public Namespace(ModelElementInfo info) {
      super(info);
      this.types = new ArrayList<>();
    }

    public void addType(GeoForgeType type) {
      types.add(type);
    }

    @JsonProperty
    public List<GeoForgeType> types() {
      return types;
    }

    public GeoForgeType getType(QName name) {
      return types.stream()
          .filter(t -> t.name().equals(name.segments()))
          .findFirst()
          .orElseThrow(() -> new IllegalArgumentException("Type not found: " + name));
    }

    public GeoForgeType getType(String nameString) {
      return getType(new QName(nameString));
    }
  }

  public static class Model extends Namespace {

    public Model(ModelElementInfo info) {
      super(info);
    }

    @JsonCreator
    public static Model of(
        @JsonProperty("name") List<String> name,
        @JsonProperty("title") String title,
        @JsonProperty("description") String description,
        @JsonProperty("tags") List<Tag> tags,
        @JsonProperty("types") List<GeoForgeType> types
    ) {
      var model = new Model(new ModelElementInfo(name, title, description));
      model.tags().addAll(tags);
      model.types().addAll(types);
      return model;
    }
  }

  public static class Package extends Namespace {

    public Package(ModelElementInfo info) {
      super(info);
    }
  }

  @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "entityType")
  @JsonSubTypes({
    @JsonSubTypes.Type(value = DataType.class, name = "dataType"),
    @JsonSubTypes.Type(value = LayerType.class, name = "layerType"),
    @JsonSubTypes.Type(value = EnumType.class, name = "enumType"),
    @JsonSubTypes.Type(value = BuiltinType.class, name = "builtinType"),
  })
  public static abstract class GeoForgeType extends ModelElement {

    public GeoForgeType(ModelElementInfo info) {
      super(info);
    }
  }

  public static class Ref<T extends ModelElement> {
  
    private QName qName;
    private T element;

    public Ref(QName qName) {
      this.qName = qName;
    }

    public Ref(String nameString) {
      this(new QName(nameString));
    }

    @JsonProperty("qName")
    public List<String> qName() {
      return qName.segments();
    }

    public T element() {
      return element;
    }

    public void setElement(T element) {
      this.element = element;
    }
  }

  public static class TypeRef<T extends GeoForgeType> extends Ref<T> {

    @JsonCreator
    public TypeRef(
        @JsonProperty("qName") List<String> qName
    ) {
      super(new QName(qName));
    }

    public TypeRef(String nameString) {
      super(nameString);
    }
  }
  
  public static abstract class CompositeType<T extends CompositeType<T>> extends GeoForgeType {

    private boolean isAbstract;
    private TypeRef<? extends T> superType;
    private final List<CompositeTypeProperty> properties;
    
    protected CompositeType(ModelElementInfo info, boolean isAbstract, TypeRef<? extends T> superType,
        List<CompositeTypeProperty> properties) {
      super(info);
      this.isAbstract = isAbstract;
      this.superType = superType;
      this.properties = new ArrayList<>(properties);
    }

    protected CompositeType(String name, boolean isAbstract, TypeRef<? extends T> superType,
        List<CompositeTypeProperty> properties) {
      this(new ModelElementInfo(name), isAbstract, superType, properties);
    }

    public boolean isAbstract() {
      return isAbstract;
    }

    @JsonProperty("superType")
    public TypeRef<? extends T> superType() {
      return superType;
    }

    @JsonProperty("properties")
    public List<CompositeTypeProperty> properties() {
      return properties;
    }
  }

  public static class DataType extends CompositeType<DataType> {

    public DataType(ModelElementInfo info, boolean isAbstract, TypeRef<DataType> superType, List<CompositeTypeProperty> properties) {
      super(info, isAbstract, superType, properties);
    }

    public DataType(String name, boolean isAbstract, TypeRef<DataType> superType, List<CompositeTypeProperty> properties) {
      this(new ModelElementInfo(name), isAbstract, superType, properties);
    }

    @JsonCreator
    public static DataType of(
        @JsonProperty("name") List<String> name,
        @JsonProperty("title") String title,
        @JsonProperty("description") String description,
        @JsonProperty("tags") List<Tag> tags,
        @JsonProperty("abstract") boolean isAbstract,
        @JsonProperty("superType") TypeRef<DataType> superType,
        @JsonProperty("properties") List<CompositeTypeProperty> properties
    ) {
      var compositeType = new DataType(new ModelElementInfo(name, title, description), isAbstract, superType, properties);
      compositeType.tags().addAll(tags);
      return compositeType;
    }
  }

  public static class LayerType extends CompositeType<LayerType> {

    public LayerType(ModelElementInfo info, boolean isAbstract, TypeRef<LayerType> superType, List<CompositeTypeProperty> properties) {
      super(info, isAbstract, superType, properties);
    }

    public LayerType(String name, boolean isAbstract, TypeRef<LayerType> superType, List<CompositeTypeProperty> properties) {
      this(new ModelElementInfo(name), isAbstract, superType, properties);
    }

    @JsonCreator
    public static LayerType of(
        @JsonProperty("name") List<String> name,
        @JsonProperty("title") String title,
        @JsonProperty("description") String description,
        @JsonProperty("tags") List<Tag> tags,
        @JsonProperty("abstract") boolean isAbstract,
        @JsonProperty("superType") TypeRef<LayerType> superType,
        @JsonProperty("properties") List<CompositeTypeProperty> properties
    ) {
      var compositeType = new LayerType(new ModelElementInfo(name, title, description), isAbstract, superType, properties);
      compositeType.tags().addAll(tags);
      return compositeType;
    }
  }

  public static class CompositeTypeProperty extends ModelElement {

  public enum Kind {
    ID, GEOMETRY, CONTAINMENT, CONTAINER
  }


    private Kind kind;
    private TypeRef<GeoForgeType> type;
    private Multiplicity multiplicity;
    private SimpleValue defaultValue;
  
    public CompositeTypeProperty(ModelElementInfo info, Kind kind, TypeRef<GeoForgeType> type, Multiplicity multiplicity, SimpleValue defaultValue) {
      super(info);
      this.kind = kind;
      this.type = type;
      this.multiplicity = multiplicity;
      this.defaultValue = defaultValue;
    }

    public CompositeTypeProperty(String name, Kind kind, TypeRef<GeoForgeType> type, Multiplicity multiplicity, SimpleValue defaultValue) {
      this(new ModelElementInfo(name), kind, type, multiplicity, defaultValue);
    }

    @JsonCreator
    public static CompositeTypeProperty of(
        @JsonProperty("name") List<String> name,
        @JsonProperty("title") String title,
        @JsonProperty("description") String description,
        @JsonProperty("tags") List<Tag> tags,
        @JsonProperty("kind") Kind kind,
        @JsonProperty("type") TypeRef<GeoForgeType> type,
        @JsonProperty("multiplicity") Multiplicity multiplicity,
        @JsonProperty("defaultValue") String defaultValue
    ) {
      var property = new CompositeTypeProperty(new ModelElementInfo(name, title, description), kind, type, multiplicity, SimpleValue.of(defaultValue));
      property.tags().addAll(tags);
      return property;
    }

    @JsonProperty("kind")
    public Kind kind() {
      return kind;
    }
    
    @JsonProperty("type")
    public TypeRef<GeoForgeType> type() {
      return type;
    }
    
    @JsonProperty("multiplicity")
    public Multiplicity multiplicity() {
      return multiplicity;
    }

    @JsonProperty("defaultValue")
    public SimpleValue defaultValue() {
      return defaultValue;
    }
  }

  public record Multiplicity(int lower, int upper) {

    public static final Multiplicity ZERO_OR_ONE = new Multiplicity(0, 1);
    public static final Multiplicity EXACTLY_ONE = new Multiplicity(1, 1);
    public static final Multiplicity ZERO_OR_MORE = new Multiplicity(0, -1);
    public static final Multiplicity ONE_OR_MORE = new Multiplicity(1, -1);
  }

  public static class BuiltinType extends GeoForgeType {

    private List<BuiltinParam> params;

    public BuiltinType(ModelElementInfo info, List<BuiltinParam> params) {
      super(info);
      this.params = Collections.unmodifiableList(params);
    }

    public BuiltinType(String name, List<BuiltinParam> params) {
      this(new ModelElementInfo(name), params);
    }

    public BuiltinType(ModelElementInfo info) {
      this(info, Collections.emptyList());
    }

    public BuiltinType(String name) {
      this(new ModelElementInfo(name));
    }

    @JsonCreator
    public static BuiltinType of(
        @JsonProperty("name")
        List<String> name,
        @JsonProperty("title")
        String title,
        @JsonProperty("description")
        String description,
        @JsonProperty("tags")
        List<Tag> tags
    ) {
      var builtinType = new BuiltinType(new ModelElementInfo(name, title, description), List.of());
      builtinType.tags().addAll(tags);
      return builtinType;
    }

    public List<BuiltinParam> params() {
      return params;
    }
  }

  public record BuiltinParam(String name, SimpleValue value) {
  }

  public static class EnumType extends GeoForgeType {

    private final List<EnumProperty> properties;

    public EnumType(ModelElementInfo info, List<EnumProperty> properties) {
      super(info);
      this.properties = Collections.unmodifiableList(properties);
    }

    public EnumType(String name, List<EnumProperty> properties) {
      this(new ModelElementInfo(name), properties);
    }

    @JsonCreator
    public static EnumType of(
        @JsonProperty("name") List<String> name,
        @JsonProperty("title") String title,
        @JsonProperty("description") String description,
        @JsonProperty("tags") List<Tag> tags,
        @JsonProperty("properties") List<EnumProperty> properties
    ) {
      var enumType = new EnumType(new ModelElementInfo(name, title, description), properties);
      enumType.tags().addAll(tags);
      return enumType;
    }

    @JsonProperty("properties")
    public List<EnumProperty> properties() {
      return properties;
    }
  }

  public static class EnumProperty extends ModelElement {

    private final String value;

    public EnumProperty(ModelElementInfo info, String value) {
      super(info);
      this.value = value;
    }

    @JsonCreator
    public static EnumProperty of(
        @JsonProperty("name") List<String> name,
        @JsonProperty("title") String title,
        @JsonProperty("description") String description,
        @JsonProperty("tags") List<Tag> tags,
        @JsonProperty("value") String value
    ) {
      var property = new EnumProperty(new ModelElementInfo(name, title, description), value);
      property.tags().addAll(tags);
      return property;
    }

    public String value() {
      return value;
    }
  }
}
