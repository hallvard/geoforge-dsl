package no.ngu.nadag.innmelding.dtogen;

/**
 * Helper class for generating Java names for various purposes.
 */
public class DtoNaming extends JavaNaming {
  
  @Override
  public String toJavaPackageName(String name) {
    return replaceNonPathLetters(name, "_").replaceAll("_+", "_").toLowerCase();
  }

  @Override
  public String toJavaClassName(String name) {
    return toFirstUpperCase(replaceNonPathLetters(name, "_").replaceAll("_+", "_"));
  }

  @Override
  public String toMemberName(String name) {
    return fixMemberName(name, "_", "_").replaceAll("_+", "_");
  }

  @Override
  public String toConstantMemberName(String name) {
    return toSnakeUpperCase(toMemberName(name));
  }
}
