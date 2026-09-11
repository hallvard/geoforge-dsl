package no.geoforge.shapechange;

import de.interactive_instruments.shapechange.core.model.ClassInfo;
import de.interactive_instruments.shapechange.core.model.Model;
import de.interactive_instruments.shapechange.core.model.PackageInfo;
import de.interactive_instruments.shapechange.core.Options;
import de.interactive_instruments.shapechange.core.RuleRegistry;
import de.interactive_instruments.shapechange.core.ShapeChangeAbortException;
import de.interactive_instruments.shapechange.core.ShapeChangeResult;
import java.nio.file.Path;

/**
 * ShapeChange target for translating ShapeChange models to GeoForge JSON.
 */
public class ShapechangeToGeoForgeTarget
    implements de.interactive_instruments.shapechange.core.target.SingleTarget {

  private ShapechangeToGeoForgeTranslator generator;
  private String outputFile;
  private String modelName;
  private String namePrefix;
  private String tagPrefix;
  private String javaTypeMappingsFile;

  @Override
  public String getDefaultEncodingRule() {
    return null;
  }

  @Override
  public String getTargetIdentifier() {
    return "geoforge-json";
  }

  @Override
  public String getTargetName() {
    return "GeoForge JSON model";
  }

  @Override
  public void registerRulesAndRequirements(RuleRegistry ruleRegistry) {
    // no custom rules yet
  }

  @Override
  public void initialise(PackageInfo packageInfo, Model model, Options options,
      ShapeChangeResult result, boolean isDiagnostics)
      throws ShapeChangeAbortException {
    outputFile = options.parameter(this.getClass().getName(), "outputFile");
    if (outputFile == null || outputFile.isBlank()) {
      outputFile = "target/generated/geoforge.json";
    }
    modelName = options.parameter(this.getClass().getName(), "modelName");
    if (modelName == null || modelName.isBlank()) {
      modelName = packageInfo != null && packageInfo.fullName() != null && !packageInfo.fullName().isBlank()
          ? packageInfo.fullName().replace("::", ".")
          : "geoforge.shapechange";
    }
    namePrefix = options.parameter(this.getClass().getName(), "namePrefix");
    if (namePrefix == null || namePrefix.isBlank()) {
      namePrefix = modelName;
    }
    tagPrefix = options.parameter(this.getClass().getName(), "tagPrefix");
    if (tagPrefix != null) {
      tagPrefix = tagPrefix.trim();
      if (tagPrefix.isEmpty()) {
        tagPrefix = null;
      }
    }
    javaTypeMappingsFile = options.parameter(this.getClass().getName(), "javaTypeMappingsFile");
    if (javaTypeMappingsFile != null) {
      javaTypeMappingsFile = javaTypeMappingsFile.trim();
      if (javaTypeMappingsFile.isEmpty()) {
        javaTypeMappingsFile = null;
      }
    }
    System.out.println("Generating " + getTargetName()
        + " with outputFile=" + outputFile
        + " modelName=" + modelName
        + " namePrefix=" + namePrefix
        + " tagPrefix=" + (tagPrefix == null ? "<none>" : tagPrefix)
        + " javaTypeMappingsFile=" + (javaTypeMappingsFile == null ? "<none>" : javaTypeMappingsFile));
    generator = new ShapechangeToGeoForgeTranslator(model, namePrefix, tagPrefix, javaTypeMappingsFile);
  }

  @Override
  public void reset() {
    generator = null;
  }

  @Override
  public void process(ClassInfo classInfo) {
    if (classInfo == null) {
      return;
    }
    generator.generateFor(classInfo);
  }

  @Override
  public void write() {
    generator.writeModel(Path.of(outputFile), modelName);
  }

  @Override
  public void writeAll(ShapeChangeResult result) {
    // final write not used
  }
}