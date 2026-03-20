package no.ngu.nadag.innmelding.dtogen;

import com.palantir.javapoet.AnnotationSpec;
import com.palantir.javapoet.FieldSpec;
import com.palantir.javapoet.MethodSpec;
import com.palantir.javapoet.ParameterSpec;
import com.palantir.javapoet.TypeName;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.function.Consumer;

public class JakartaValidationSupport {
  
  private void addValidationAnnotations(PropertyInfo prop, TypeName javaType, Consumer<AnnotationSpec> annotationConsumer) {
    var javaTypeName = javaType.toString();
    var mult = prop.cardinality();
    if (mult.minOccurs >= 1 && (! isPrimitiveType(javaTypeName))) {
      annotationConsumer.accept(AnnotationSpec.builder(NotNull.class).build());
    }
    var maxLengthTag = prop.taggedValue("SOSI_lengde");
    if (maxLengthTag != null && (! maxLengthTag.isBlank())) {
      var maxLength = Integer.valueOf(maxLengthTag);
      if ("java.lang.String".equals(javaTypeName)) {
        annotationConsumer.accept(AnnotationSpec.builder(Size.class)
        .addMember("max", "$L", maxLength)
        .build());
      } else if (isIntegerType(javaTypeName)) {
        annotationConsumer.accept(AnnotationSpec.builder(Max.class)
          .addMember("value", "$L", (int) Math.pow(10, maxLength) - 1)
          .build());
        annotationConsumer.accept(AnnotationSpec.builder(PositiveOrZero.class)
          .build());
      }
    }
  }

  private static boolean isPrimitiveType(String javaTypeName) {
    return javaTypeName.indexOf('.') < 0;
  }

  private static boolean isIntegerType(String javaTypeName) {
    return "int".equals(javaTypeName) || "java.lang.Integer".equals(javaTypeName);
  }

  public void addValidationAnnotations(PropertyInfo prop, TypeName javaType, MethodSpec.Builder builder) {
    addValidationAnnotations(prop, javaType, builder::addAnnotation);
  }

  public void addValidationAnnotations(PropertyInfo prop, TypeName javaType, FieldSpec.Builder builder) {
    addValidationAnnotations(prop, javaType, builder::addAnnotation);
  }

  public void addValidationAnnotations(PropertyInfo prop, TypeName javaType, ParameterSpec.Builder builder) {
    addValidationAnnotations(prop, javaType, builder::addAnnotation);
  }
}
