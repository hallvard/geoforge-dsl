package no.ngu.nadag.innmelding.dtogen;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Map;

/**
 * CLI entry point for generating Java DTOs from a GeoForge JSON model.
 */
public final class GeoForgeDtoGeneratorMain {

  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

  private GeoForgeDtoGeneratorMain() {
  }

  public static void main(String[] args) {
    if (args.length != 2) {
      System.err.println("Usage: GeoForgeDtoGeneratorMain <model.json> <config.json>");
      System.exit(1);
    }

    var modelFile = Path.of(args[0]);
    var configFile = Path.of(args[1]);
    var config = readConfig(configFile);

    var outputDir = resolveOutputDirectory(config, configFile);
    var basePackage = config.packagePrefix() == null || config.packagePrefix().isBlank()
        ? "no.ngu.generated"
        : config.packagePrefix().trim();
    var builtinTypeMappings = config.builtinTypeMappings() == null ? Map.<String, String>of() : config.builtinTypeMappings();

    var generator = new GeoForgeDtoGenerator(basePackage, builtinTypeMappings);
    generator.writeFromJson(modelFile, outputDir);
  }

  private static JavaGeneratorConfig readConfig(Path configFile) {
    try {
      return OBJECT_MAPPER.readValue(configFile.toFile(), JavaGeneratorConfig.class);
    } catch (IOException e) {
      throw new IllegalStateException("Failed to read Java generator config from " + configFile, e);
    }
  }

  private static Path resolveOutputDirectory(JavaGeneratorConfig config, Path configFile) {
    if (config.destinationFolder() == null || config.destinationFolder().isBlank()) {
      return configFile.getParent().resolve("generated-sources").normalize();
    }
    var configured = Path.of(config.destinationFolder().trim());
    if (configured.isAbsolute()) {
      return configured;
    }
    return configFile.getParent().resolve(configured).normalize();
  }
}
