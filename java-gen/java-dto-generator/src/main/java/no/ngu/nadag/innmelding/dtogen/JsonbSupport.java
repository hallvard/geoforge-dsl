package no.ngu.nadag.innmelding.dtogen;

import com.palantir.javapoet.AnnotationSpec;
import com.palantir.javapoet.MethodSpec;
import com.palantir.javapoet.TypeName;
import com.palantir.javapoet.TypeSpec;
import de.interactive_instruments.ShapeChange.Model.ClassInfo;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;
import jakarta.json.bind.annotation.JsonbDateFormat;
import jakarta.json.bind.annotation.JsonbSubtype;
import jakarta.json.bind.annotation.JsonbTypeAdapter;
import jakarta.json.bind.annotation.JsonbTypeInfo;
import java.util.Collection;

/**
 * Helper class for adding Microprofile OpenAPI annotations to Java classes and properties.
 */
public class JsonbSupport {

  private String jsonbTypeKey;
  private JavaNaming naming;
  private JavaTypes types;

  /**
   * Initializes with the specified JSON-B type key, naming and types.
   */
  public JsonbSupport(String jsonbTypeKey, JavaNaming naming, JavaTypes types) {
    this.jsonbTypeKey = jsonbTypeKey;
    this.naming = naming;
    this.types = types;
  }

  /**
   * Adds JSON-B annotations to a property getter method as needed.
   */
  public boolean needsJsonbGetterAnnotation(PropertyInfo prop, TypeName javaType) {
    return javaType.toString().equals("java.time.ZonedDateTime");
  }

  /**
   * Adds JSON-B annotations to a property getter method as needed.
   */
  public void addJsonbGetterAnnotation(PropertyInfo prop, TypeName javaType,
      MethodSpec.Builder builder) {
    if (javaType.toString().equals("java.time.ZonedDateTime")) {
      var dateFormatAnnotation = AnnotationSpec.builder(JsonbDateFormat.class)
          .addMember("value", "$S", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
          .build();
      builder.addAnnotation(dateFormatAnnotation);
    }
  }

  public void addJsonbSetterAnnotation(PropertyInfo prop, TypeName javaType,
      MethodSpec.Builder builder) {
  }

  /**
   * Adds JSON-B type info annotation to abstract class.
   */
  public void addJsonbTypeInfoAnnotation(TypeSpec.Builder builder,
      Collection<ClassInfo> subclasses) {
    var annotationsBuilder = AnnotationSpec.builder(JsonbTypeInfo.class)
        .addMember("key", "$S", jsonbTypeKey);
    for (var subclass : subclasses) {
      annotationsBuilder.addMember("value", "$L", AnnotationSpec.builder(JsonbSubtype.class)
          .addMember("type", "$L", types.typeFor(subclass) + ".class")
          .addMember("alias", "$S", naming.toJavaClassName(subclass.name()))
          .build()
      );
    }
    builder.addAnnotation(annotationsBuilder.build());
  }

  /**
   * Adds JsonbAdapter annotation to dto class.
   *
   * @param builder the builder for the dto class
   * @param jsonbAdapterType the TypeSpec for the JsonbAdapter class
   */
  public void addJsonbAdapterAnnotation(TypeSpec.Builder builder, TypeName jsonbAdapterType) {
    var adapterAnnotation = AnnotationSpec.builder(JsonbTypeAdapter.class)
        .addMember("value", "$L", jsonbAdapterType + ".class")
        .build();
    builder.addAnnotation(adapterAnnotation);
  }
}
