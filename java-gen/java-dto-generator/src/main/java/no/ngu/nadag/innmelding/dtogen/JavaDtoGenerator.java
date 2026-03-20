package no.ngu.nadag.innmelding.dtogen;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;

import javax.lang.model.element.Modifier;

import org.eclipse.microprofile.openapi.annotations.media.SchemaProperty;

import com.palantir.javapoet.AnnotationSpec;
import com.palantir.javapoet.ClassName;
import com.palantir.javapoet.FieldSpec;
import com.palantir.javapoet.JavaFile;
import com.palantir.javapoet.MethodSpec;
import com.palantir.javapoet.ParameterSpec;
import com.palantir.javapoet.ParameterizedTypeName;
import com.palantir.javapoet.TypeSpec;

import de.interactive_instruments.ShapeChange.Model.ClassInfo;
import de.interactive_instruments.ShapeChange.Model.Model;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;

/**
 * Generates Java DTO source code for a model.
 */
public class JavaDtoGenerator extends AbstractGenerator<TypeSpec.Builder> {
  
  private final String jsonbTypeKey = "jsonType";

  private JavaNaming naming = new DtoNaming();
  private JakartaValidationSupport validationSupport = new JakartaValidationSupport();
  private MicroprofileOpenapiSupport openapiSupport = new MicroprofileOpenapiSupport(naming);
  private JavaTypes types = new JavaTypes();
  private JsonbSupport jsonbSupport = new JsonbSupport(jsonbTypeKey, naming, types);
  
  private final String basePackage;

  /**
   * Initializes the generator with a base package and a model.
   */
  public JavaDtoGenerator(String basePackage, Model model) {
    super(model);
    this.basePackage = basePackage;
  }

  void writeClassFiles(Path directory) {
    var allConcreteSubclasses = new ArrayList<>();
    for (var containedClass : containedClasses) {
      if (subclasses.containsKey(containedClass)) {
        var concreteSubclasses = subclasses.get(containedClass).stream()
            .filter(Predicate.not(ClassInfo::isAbstract))
            .toList();
        if (! concreteSubclasses.isEmpty()) {
          jsonbSupport.addJsonbTypeInfoAnnotation(generated.get(containedClass),
              concreteSubclasses);
          allConcreteSubclasses.addAll(concreteSubclasses);
        }
      }
    }
    for (var entry : generated.entrySet()) {
      var classInfo = entry.getKey();
      var builder = entry.getValue();
      openapiSupport.addSchemaAnnotations(classInfo, builder,
          ab -> {
            if (allConcreteSubclasses.contains(classInfo)) {
              addSchemaTypeProperty(classInfo, ab);
            }
            if (containedClasses.contains(classInfo) && subclasses.containsKey(classInfo)) {
              addSchemaOneOfProperty(classInfo, ab);
            }
          }
      );

      var typeClass = builder.build();
      var javaFile = javaFile(classInfo.fullName(), typeClass);
      try {
        javaFile.writeTo(directory);
      } catch (IOException e) {
        System.err.println(e);
      }
    }
    if (enumSuperinterfaceType != null) {
      var javaFile = javaFile(enumSuperinterfaceType.name(), enumSuperinterfaceType);
      try {
        javaFile.writeTo(directory);
      } catch (IOException e) {
        System.err.println(e);
      }
    }
  }

  private void addSchemaTypeProperty(ClassInfo classInfo, AnnotationSpec.Builder ab) {
    ab.addMember("properties", "$L",
        AnnotationSpec.builder(SchemaProperty.class)
          .addMember("name", "$S", jsonbTypeKey)
          .addMember("constValue", "$S", naming.toJavaClassName(classInfo.name()))
          .build()
    );
  }

  private void addSchemaOneOfProperty(ClassInfo classInfo, AnnotationSpec.Builder ab) {
    var concreteSubclasses = subclasses.get(classInfo).stream()
        .filter(Predicate.not(ClassInfo::isAbstract))
        .toList();
    if (! concreteSubclasses.isEmpty()) {
      for (var concreteSubclass : concreteSubclasses) {
        ab.addMember("oneOf", "$L", types.typeFor(concreteSubclass) + ".class");
      }
      ab.addMember("discriminatorProperty", "$S", jsonbTypeKey);
    }
  }
  
  private JavaFile javaFile(String className, TypeSpec typeClass) {
    return JavaFile.builder(naming.fullNameToPackageName(className, basePackage), typeClass)
    .build();
  }

  public void clear() {
    super.clear();
    this.types = new JavaTypes();
  }

  private void ensureTypeSpec(ClassInfo classInfo) {
    if (classInfo != null && (! types.hasTypeFor(classInfo))) {
      super.generateFor(classInfo);
    }
  }

  private List<String> toStringProperties = List.of("identifikasjon");

  @Override
  protected void generateForFeatureType(ClassInfo classInfo) {
    System.out.println("Featuretype-klasse: " + classInfo.name());
    var className = registerTypeName(classInfo);
    var builder = TypeSpec.classBuilder(className)
        .addModifiers(Modifier.PUBLIC)
        .addMethod(MethodSpec.constructorBuilder()
            .addModifiers(classInfo.isAbstract() ? Modifier.PROTECTED : Modifier.PUBLIC)
            .build()
    );
    if (classInfo.isAbstract()) {
      builder.addModifiers(Modifier.ABSTRACT);
    }
    for (var superType : classInfo.supertypeClasses()) {
      registerSubclass(classInfo, superType);
      ensureTypeSpec(superType);
      // TODO: check if the superclass is an interface
      builder.superclass(types.typeFor(superType));
    }

    var ownerProperties = this.ownerProperties.getOrDefault(classInfo, List.of());
    var ownedProperties = this.ownedProperties.getOrDefault(classInfo, List.of());
    ToString toString = new ToString();

    var properties = classInfo.properties().values(); 
    for (var prop : properties) {
      if (this.toStringProperties.contains(prop.name())) {
        toString.addPart(prop.name());
      }
      // add property if it is not owned
      if (!ownedProperties.contains(prop) && !ownerProperties.contains(prop)) {
        var propTypeInfo = prop.typeClass();
        ensureTypeSpec(propTypeInfo);
        addPropertyMembers(builder, prop);
      }
    }
    if (toString.hasParts()) {
      toString.addToString(builder);
    }
    // add properties for the owning ends
    for (var prop : ownerProperties) {
      var propTypeInfo = prop.typeClass();
      ensureTypeSpec(propTypeInfo);
      addPropertyMembers(builder, prop);
    }
    registerGenerated(classInfo, builder);
  }

  private void addPropertyMembers(TypeSpec.Builder builder, PropertyInfo prop) {
    var fieldType = types.typeFor(prop);
    if (fieldType == null) {
      System.out.println(" !!! No field type for %s of type %s"
          .formatted(prop.name(), prop.typeInfo().name)
      );
    } else {
      var fieldBuilder = FieldSpec.builder(fieldType, naming.toMemberName(prop.name()),
          Modifier.PRIVATE);
      if (JavaTypes.isMany(prop)) {
        fieldBuilder.initializer("new java.util.ArrayList<>()");
      }
      var field = fieldBuilder.build();
      builder.addField(field);
      builder.addMethod(getterForField(prop, field).build());
      builder.addMethod(setterForField(prop, field).build());
    }
  }

  private String registerTypeName(ClassInfo classInfo) {
    var className = naming.toJavaClassName(classInfo.name());
    var fullName = naming.fullNameToPackageName(classInfo.fullName(), basePackage);
    types.registerTypeName(classInfo, fullName, className);
    return className;
  }

  @Override
  protected void generateForDataType(ClassInfo classInfo) {
    if (! classInfo.supertypeClasses().isEmpty()) {
      generateForFeatureType(classInfo);
    } else {
      System.out.println("Datatype-klasse: " + classInfo.name());
      var className = registerTypeName(classInfo);
      var builder = TypeSpec.recordBuilder(className)
          .addModifiers(Modifier.PUBLIC);

      List<MethodSpec> getters = new ArrayList<>();
      var consBuilder = MethodSpec.constructorBuilder();
      for (var prop : classInfo.properties().values()) {
        var propTypeInfo = prop.typeClass();
        if (prop.isComposition() && propTypeInfo != null) {
          ensureTypeSpec(propTypeInfo);
        }
        var fieldType = types.typeFor(prop);
        if (fieldType == null) {
          System.out.println("No field type for %s of type %s"
              .formatted(prop.name(), prop.typeInfo().name)
          );
        } else {
          var parameter = ParameterSpec.builder(fieldType, naming.toMemberName(prop.name()));
          validationSupport.addValidationAnnotations(prop, types.typeFor(prop), parameter);
          openapiSupport.addSchemaAnnotations(prop, types.typeFor(prop), parameter);
          consBuilder.addParameter(parameter.build());
          if (jsonbSupport.needsJsonbGetterAnnotation(prop, types.typeFor(prop))) {
            var getterBuilder = MethodSpec.methodBuilder(prop.name())
              .addModifiers(Modifier.PUBLIC)
              .returns(fieldType)
              .addAnnotation(Override.class)
              .addStatement("return this." + prop.name());
            jsonbSupport.addJsonbGetterAnnotation(prop, fieldType, getterBuilder);
            getters.add(getterBuilder.build());
          }
        }
      }
      builder.recordConstructor(consBuilder.build());
      for (var getter : getters) {
        builder.addMethod(getter);
      }
      registerGenerated(classInfo, builder);
    }
  }

  private TypeSpec enumSuperinterfaceType = null;

  private ClassName getEnumSuperinterfaceTypeName() {
    if (enumSuperinterfaceType == null) {
      enumSuperinterfaceType = TypeSpec.interfaceBuilder("CodeListItem")
        .addModifiers(Modifier.PUBLIC)
        .addMethod(MethodSpec.methodBuilder("getLabel")
          .addModifiers(Modifier.PUBLIC, Modifier.ABSTRACT)
          .returns(String.class).build())
        .addMethod(MethodSpec.methodBuilder("getCode")
          .addModifiers(Modifier.PUBLIC, Modifier.ABSTRACT)
          .returns(int.class).build())
        .build();
    }
    return ClassName.get(basePackage, "CodeListItem");
  }

  @Override
  protected void generateForCodeList(ClassInfo classInfo) {
    var className = registerTypeName(classInfo);
    var labelField = FieldSpec.builder(String.class, "label", Modifier.PRIVATE).build();
    var enumSuperinterfaceName = getEnumSuperinterfaceTypeName();
    var jsonbAdapter = TypeSpec.classBuilder("JsonbAdapter")
        .addModifiers(Modifier.PUBLIC, Modifier.STATIC)
        .superclass(ParameterizedTypeName.get(
            enumSuperinterfaceName.nestedClass("AbstractJsonbAdapter"),
            ClassName.get("", className)
        ))
        .addMethod(MethodSpec.constructorBuilder()
            .addModifiers(Modifier.PUBLIC)
            .addStatement("super($L.class)", ClassName.get("", className))
            .build()
        ).build();
    var builder = TypeSpec.enumBuilder(className)
        .addModifiers(Modifier.PUBLIC)
        .addSuperinterface(getEnumSuperinterfaceTypeName());
    builder.addType(jsonbAdapter);
    jsonbSupport.addJsonbAdapterAnnotation(builder, ClassName.get("", className, "JsonbAdapter"));
    builder
        .addFields(List.of(labelField))
        .addMethod(constructorForFieldsUsingFieldAssignment(labelField)
          .addModifiers(Modifier.PRIVATE)
          .build())
        .addMethod(getterForField(null, labelField)
          .addAnnotation(Override.class)
          .build());
    for (var prop : classInfo.properties().values()) {
      var label = (prop.initialValue() != null ? prop.initialValue() : prop.name());
      builder.addEnumConstant(naming.toConstantMemberName(prop.name()),
          TypeSpec.anonymousClassBuilder("$S", label).build());
    }
    registerGenerated(classInfo, builder);
  }

  private MethodSpec.Builder constructorForFields(Function<FieldSpec, String> statementFun,
      FieldSpec... fields) {
    var builder = MethodSpec.constructorBuilder();
    for (var field : fields) {
      builder.addParameter(field.type(), field.name());
    }
    for (var field : fields) {
      builder.addStatement(statementFun.apply(field));
    }
    return builder;
  }

  private MethodSpec.Builder constructorForFieldsUsingFieldAssignment(FieldSpec... fields) {
    return constructorForFields(field -> "this." + field.name() + " = " + field.name(), fields);
  }

  private MethodSpec.Builder getterForField(PropertyInfo prop, FieldSpec field) {
    var builder = MethodSpec.methodBuilder(naming.toGetterName(field))
        .addModifiers(Modifier.PUBLIC)
        .returns(field.type())
        .addStatement("return this." + field.name());
    if (prop != null) {
      jsonbSupport.addJsonbGetterAnnotation(prop, types.typeFor(prop), builder);
      openapiSupport.addSchemaAnnotations(prop, types.typeFor(prop), builder);
    }
    return builder;
  }

  private MethodSpec.Builder setterForField(PropertyInfo prop, FieldSpec field) {
    var builder = MethodSpec.methodBuilder(naming.toSetterName(field))
        .addModifiers(Modifier.PUBLIC)
        .returns(void.class);
    var parameter = ParameterSpec.builder(field.type(), field.name());
    validationSupport.addValidationAnnotations(prop, types.typeFor(prop), parameter);
    builder
        .addParameter(parameter.build())
        .addStatement("this." + field.name() + " = " + field.name());
    return builder;
  }
}
