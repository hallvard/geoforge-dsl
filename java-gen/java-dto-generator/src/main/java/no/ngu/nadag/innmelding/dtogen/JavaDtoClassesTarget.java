package no.ngu.nadag.innmelding.dtogen;

import de.interactive_instruments.ShapeChange.Model.ClassInfo;
import de.interactive_instruments.ShapeChange.Model.Model;
import de.interactive_instruments.ShapeChange.Model.PackageInfo;
import de.interactive_instruments.ShapeChange.Options;
import de.interactive_instruments.ShapeChange.RuleRegistry;
import de.interactive_instruments.ShapeChange.ShapeChangeAbortException;
import de.interactive_instruments.ShapeChange.ShapeChangeResult;
import java.nio.file.Path;

/**
 * ShapeChage target for generating Java API Data objects.
 */
public class JavaDtoClassesTarget
    implements de.interactive_instruments.ShapeChange.Target.SingleTarget {

  @Override
  public String getDefaultEncodingRule() {
    return null; // not relevant
  }

  @Override
  public String getTargetIdentifier() {
    return "java-api-data";
  }

  @Override
  public String getTargetName() {
    return "Java API Data objects";
  }

  @Override
  public void registerRulesAndRequirements(RuleRegistry ruleRegistry) {
    // nothing yet
  }

  private String sourceOutputDir;
  private String basePackage;

  @Override
  public void initialise(PackageInfo packageInfo, Model model, Options options,
      ShapeChangeResult result, boolean isDiagnostics)
      throws ShapeChangeAbortException {
    this.sourceOutputDir = options.parameter(this.getClass().getName(), "sourceOutputDirectory");
    this.basePackage = options.parameter(this.getClass().getName(), "basePackage");
    System.out.println("Generating " + getTargetName()
        + " with sourceOutputDirectory=" + this.sourceOutputDir
        + " basePackage=" + this.basePackage);
    generator = new JavaDtoGenerator(basePackage, model);
  }

  @Override
  public void reset() {
    generator = null;
  }

  private JavaDtoGenerator generator;

  @Override
  public void process(ClassInfo classInfo) {
    // System.out.println("process " + classInfo.fullName());
    generator.generateFor(classInfo);
  }

  @Override
  public void write() {
    generator.writeClassFiles(Path.of(sourceOutputDir));
  }

  @Override
  public void writeAll(ShapeChangeResult result) {
    // final write
  }  
}
