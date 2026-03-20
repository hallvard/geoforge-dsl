package no.ngu.nadag.innmelding.dtogen;

import com.palantir.javapoet.FieldSpec;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;

/**
 * Abstract helper class for generating Java names for various purposes.
 */
public abstract class JavaNaming {
  
  /**
   * Converts a name to a legal Java package name.
   *
   * @param name the name to convert
   * @return the corresponding legal package name
   */
  public abstract String toJavaPackageName(String name);

  /**
   * Converts a model class name to a legal Java class name.
   *
   * @param name the model class name
   * @return the legal Java class name
   */
  public abstract String toJavaClassName(String name);

  /**
   * Converts a model class member name to a legal Java member name.
   *
   * @param name the model class member name
   * @return the legal Java class member name
   */
  public abstract String toMemberName(String name);

  /**
   * Constructs a (camelCase) name from a prefix and a name.
   * Assumes the prefixes first letter is lower case.
   *
   * @param prefix the prefix
   * @param name the name
   * @return the member name
   */
  public String toMemberName(String prefix, String name) {
    if (prefix != null) {
      return prefix + JavaNaming.toFirstUpperCase(name);
    }
    return toMemberName(name);
  }

  /**
   * Converts a model class constant member name to a legal Java member name.
   *
   * @param name the model class constant member name
   * @return the legal Java class constant member name
   */
  public abstract String toConstantMemberName(String name);

  /**
   * Gets the getter name for a field.
   *
   * @param field the field
   * @return the getter name
   */
  public String toGetterName(FieldSpec field) {
    var prefix = "boolean".equals(field.type().getClass().getName()) ? "is" : "get";
    return toMemberName(prefix, field.name());
  }

  /**
   * Gets the setter name for a field.
   *
   * @param field the field
   * @return the setter name
   */
  public String toSetterName(FieldSpec field) {
    return toMemberName("set", field.name());
  }

  /**
   * Converts a full model name, i.e. a class name with package segments,
   * to a legal Java package name.
   * Splits on "::" and keeps only the last package segment.
   *
   * @param fullName the full model name
   * @param basePackage the base package name to prepend
   * @return the Java package name
   */
  public String fullNameToPackageName(String fullName, String basePackage) {
    return fullNameToPackageName(fullName, basePackage, "::", 1);
  }

  /**
   * Converts a full model name, i.e. a class name with package segments,
   * to a legal Java package name.
   * Splits on the specificed separateor and uses the specified number of package segments.
   *
   * @param fullName the full model name
   * @param basePackage the base package name to prepend
   * @param separator the package segment separator
   * @param segmentCount how many of the last package segments to use
   * @return the Java package name
   */
  public String fullNameToPackageName(String fullName, String basePackage, String separator,
      int segmentCount) {
    return fullNameToPackageName(fullName, basePackage, separator, -2 - segmentCount, -2);
  }

  private String fullNameToPackageName(String fullName, String basePackage, String separator,
      int segmentsStart, int segmentsEnd) {
    String[] segments = fullName.split(separator);
    if (segmentsStart < 0) {
      segmentsStart += segments.length + 1;
      if (segmentsStart < 0) {
        segmentsStart = 0;
      }
    }
    if (segmentsEnd < 0) {
      segmentsEnd += segments.length + 1;
      if (segmentsEnd < 0) {
        segmentsEnd = 0;
      }
    }
    StringBuilder packName = new StringBuilder();
    if (basePackage != null) {
      packName.append(basePackage);
    }
    for (int i = segmentsStart; i < segmentsEnd; i++) {
      if (packName.length() > 0) {
        packName.append(".");
      }
      packName.append(toJavaPackageName(segments[i]));
    }
    return packName.toString();
  }
  
  protected static String replaceNonPathLetters(String name, String def) {
    StringBuilder replaced = new StringBuilder();
    for (int i = 0; i < name.length(); i++) {
      char c = name.charAt(i);
      String fromNorwegianLetter = fromNorwegianLetter(c);
      if (fromNorwegianLetter != null) {
        replaced.append(fromNorwegianLetter);
      } else if (Character.isLetter(c) || Character.isDigit(c) || c == '_') {
        replaced.append(c);
      } else if (def != null) {
        replaced.append(def);
      }
    }
    return replaced.toString();
  }
  
  /**
   * Converts a Norwegian letter to a two-letter representation.
   */
  public static String fromNorwegianLetter(char c) {
    return switch (c) {
      case 'Æ' -> "AE";
      case 'æ' -> "ae"; 
      case 'Ø' -> "OE"; 
      case 'ø' -> "oe"; 
      case 'Å' -> "AA"; 
      case 'å' -> "aa";
      default -> null;
    };
  }

  /**
   * Uppercases the first letter of a name.
   *
   * @param name the name
   * @return the name with first letter uppercased
   */
  public static String toFirstUpperCase(String name) {
    if (Character.isLowerCase(name.charAt(0))) {
      name = name.substring(0, 1).toUpperCase() + name.substring(1);
    }
    return name;
  }

  /**
   * Lowercases the first letter of a name.
   *
   * @param name the name
   * @return the name with first letter lowercased
   */
  public static String toFirstLowerCase(String name) {
    if (Character.isUpperCase(name.charAt(0))) {
      name = name.substring(0, 1).toLowerCase() + name.substring(1);
    }
    return name;
  }

  /**
   * Replaces illegal letters in a Java name.
   *
   * @param name the name
   * @param nonNameReplacement the replacement for non-name characters
   * @param nonStartPrefix the prefix for names starting with a non-start character
   */
  public static String fixMemberName(String name,
      String nonNameReplacement, String nonStartPrefix) {
    var memberName = name.replaceAll("[^\\p{L}0-9_]+", nonNameReplacement);
    if (! Character.isJavaIdentifierStart(memberName.charAt(0))) {
      memberName = nonStartPrefix + memberName;
    }
    return memberName;
  }

  /**
   * Converts a name to SNAKE_CASE.
   * Current version only uppercases, should also insert underscores.
   *
   * @param name the name
   * @return the snake case name
   */
  public static String toSnakeUpperCase(String name) {
    return name.toUpperCase();
  }
}
