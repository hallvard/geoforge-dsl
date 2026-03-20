package no.ngu.nadag.innmelding.dtogen;

import com.palantir.javapoet.AnnotationSpec;
import com.palantir.javapoet.FieldSpec;
import com.palantir.javapoet.MethodSpec;
import com.palantir.javapoet.ParameterSpec;
import com.palantir.javapoet.TypeName;
import com.palantir.javapoet.TypeSpec;
import de.interactive_instruments.ShapeChange.Model.ClassInfo;
import de.interactive_instruments.ShapeChange.Model.Info;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;
import java.util.function.Consumer;
import java.util.function.Function;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * Helper class for adding Microprofile OpenAPI annotations to Java classes and properties.
 */
public class MicroprofileOpenapiSupport {

  private JavaNaming naming;

  public MicroprofileOpenapiSupport(JavaNaming naming) {
    this.naming = naming;
  }

  private void addSchemaAnnotations(Info info, Class<?> annotationType,
      Function<String, String> nameFunction, Consumer<AnnotationSpec.Builder> annotationConsumer) {
    // var definition = prop.definition();
    var description = info.description();
    if (description == null) {
      description = info.documentation();
    }
    annotationConsumer.accept(AnnotationSpec.builder(annotationType)
        .addMember("name", "$S", nameFunction.apply(info.name()))
        // .addMember("title", "$S", definition)
        .addMember("description", "$S", description)
    );
  }

  public void addSchemaAnnotations(ClassInfo classInfo, TypeSpec.Builder builder,
      Consumer<AnnotationSpec.Builder> annotationConsumer) {
    addSchemaAnnotations(classInfo, Schema.class, naming::toJavaClassName, ab -> {
      if (annotationConsumer != null) {
        annotationConsumer.accept(ab);
      }
      builder.addAnnotation(ab.build());
    });
  }

  private void addSchemaAnnotations(PropertyInfo prop, TypeName javaType,
      Consumer<AnnotationSpec.Builder> annotationConsumer) {
    addSchemaAnnotations(prop, Schema.class, String::toString, annotationConsumer);
  }

  public void addSchemaAnnotations(PropertyInfo prop, TypeName javaType,
      MethodSpec.Builder builder) {
    addSchemaAnnotations(prop, javaType, ab -> builder.addAnnotation(ab.build()));
  }  

  public void addSchemaAnnotations(PropertyInfo prop, TypeName javaType,
      FieldSpec.Builder builder) {
    addSchemaAnnotations(prop, javaType, ab -> builder.addAnnotation(ab.build()));
  }

  public void addSchemaAnnotations(PropertyInfo prop, TypeName javaType,
      ParameterSpec.Builder builder) {
    addSchemaAnnotations(prop, javaType, ab -> builder.addAnnotation(ab.build()));
  }
}
