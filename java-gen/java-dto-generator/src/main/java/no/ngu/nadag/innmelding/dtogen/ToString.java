package no.ngu.nadag.innmelding.dtogen;

import com.palantir.javapoet.MethodSpec;
import com.palantir.javapoet.TypeSpec.Builder;
import java.util.ArrayList;
import java.util.List;
import java.util.StringJoiner;
import javax.lang.model.element.Modifier;

/**
 * Helper class for generating toString methods.
 */
public class ToString {
  
  private List<String> toStringParts = new ArrayList<>();

  public void addPart(String part) {
    toStringParts.add(part);
  }

  public boolean hasParts() {
    return !toStringParts.isEmpty();
  }

  /**
   * Add a toString method to the builder.
   */
  public void addToString(Builder builder) {
    var methodBuilder = MethodSpec.methodBuilder("toString")
        .addAnnotation(Override.class)
        .addModifiers(Modifier.PUBLIC)
        .returns(String.class);
    var formatString = new StringJoiner(" ").add("%s");
    var argList = new StringJoiner(", ").add("getClass().getSimpleName()");
    for (var part : toStringParts) {
      formatString.add("%s");
      argList.add(part);
    }
    methodBuilder.addStatement("return \"[%s]\".formatted(%s)".formatted(formatString, argList));
    builder.addMethod(methodBuilder.build());
  }
}
