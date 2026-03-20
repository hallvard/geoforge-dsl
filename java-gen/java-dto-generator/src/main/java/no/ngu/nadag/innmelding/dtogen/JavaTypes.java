package no.ngu.nadag.innmelding.dtogen;

import com.palantir.javapoet.ClassName;
import com.palantir.javapoet.ParameterizedTypeName;
import com.palantir.javapoet.TypeName;
import de.interactive_instruments.ShapeChange.Model.ClassInfo;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Helper class for generating Java types for various purposes.
 */
public class JavaTypes {

  private Map<String, TypeName> types = new HashMap<>();
  
  {
    types.put("Boolean", TypeName.get(boolean.class));
    types.put("Integer", TypeName.get(int.class));
    types.put("Real", TypeName.get(double.class));
    types.put("CharacterString", TypeName.get(String.class));
    types.put("Date", TypeName.get(LocalDate.class));
    types.put("DateTime", TypeName.get(ZonedDateTime.class));

    // Keep geometry values portable when no external geometry library is available.
    types.put("Punkt", TypeName.get(String.class));
    types.put("Kurve", TypeName.get(String.class));
    types.put("Flate", TypeName.get(String.class));
    types.put("GM_Surface", TypeName.get(String.class));
    types.put("GM_MultiSurface", TypeName.get(String.class));
  }

  public void registerTypeName(ClassInfo classInfo, String basePackage, String name) {
    types.put(classInfo.name(), ClassName.get(basePackage, name));
  }

  public boolean hasTypeFor(ClassInfo classInfo) {
    return types.containsKey(classInfo.name());
  }

  public TypeName typeFor(ClassInfo classInfo) {
    return types.get(classInfo.name());
  }

  public TypeName typeFor(String typeName) {
    return types.get(typeName);
  }

  /**
   * Returns the Java type for a property.
   *
   * @param prop the property
   * @return the corresponding Java type
   */
  public TypeName typeFor(PropertyInfo prop) {
    var typeName = typeFor(prop.typeInfo().name);
    if (isMany(prop)) {
      return ParameterizedTypeName.get(listClass, typeName);
    } else if (isOptional(prop)) {
      return typeName.box();
    } else {
      return typeName;
    }
  }

  private ClassName listClass = ClassName.get("java.util", "List");

  /**
   * Checks if a property is a many-valued property.
   *
   * @param prop the property to check
   * @return true of the property is a many-valued property, false otherwise
   */
  public static boolean isMany(PropertyInfo prop) {
    var mult = prop.cardinality();
    return mult.maxOccurs < 0 || mult.maxOccurs > 1;
  }

  /**
   * Checks if a property is an optional property.
   *
   * @param prop the property to check
   * @return true if the property is an optional property, false otherwise
   */
  public static boolean isOptional(PropertyInfo prop) {
    var mult = prop.cardinality();
    return mult.minOccurs == 0;
  }
}
