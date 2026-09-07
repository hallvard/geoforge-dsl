package no.geoforge.dtogen;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import org.junit.jupiter.api.Test;

class GeoForgeDtoGeneratorCliIT {

  @Test
  void generatesAndCompilesDtosFromSampleGeoForgeJson() throws Exception {
    var workDir = Files.createTempDirectory("geoforge-dto-it-");
    var modelFile = copyResourceTo(workDir, "integration/sample.geoforge.json", "sample.geoforge.json");
    var configFile = writeConfig(workDir);

    GeoForgeDtoGeneratorMain.main(new String[] {modelFile.toString(), configFile.toString()});

    var generatedRoot = workDir.resolve("generated-sources");
    assertTrue(Files.exists(generatedRoot.resolve("it/generated/CodeListItem.java")));

    var generatedJavaFiles = listJavaFiles(generatedRoot);
    assertFalse(generatedJavaFiles.isEmpty(), "Expected generated Java source files");

    compileGeneratedSources(workDir, generatedJavaFiles);
  }

  private static Path copyResourceTo(Path directory, String resourceName, String fileName) throws IOException {
    var target = directory.resolve(fileName);
    try (var input = GeoForgeDtoGeneratorCliIT.class.getClassLoader().getResourceAsStream(resourceName)) {
      assertNotNull(input, "Missing test resource: " + resourceName);
      Files.copy(input, target);
    }
    return target;
  }

  private static Path writeConfig(Path directory) throws IOException {
    var configFile = directory.resolve("geoforge-java-generator.json");
    var config = """
        {
          "destinationFolder": "generated-sources",
          "packagePrefix": "it.generated",
          "builtinTypeMappings": {}
        }
        """;
    Files.writeString(configFile, config);
    return configFile;
  }

  private static List<Path> listJavaFiles(Path root) throws IOException {
    try (var paths = Files.walk(root)) {
      return paths
          .filter(path -> path.toString().endsWith(".java"))
          .toList();
    }
  }

  private static void compileGeneratedSources(Path workDir, List<Path> javaFiles) throws IOException {
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    assertNotNull(compiler, "No system Java compiler available in current runtime");

    var diagnostics = new DiagnosticCollector<JavaFileObject>();
    var outputDir = workDir.resolve("compiled-classes");
    Files.createDirectories(outputDir);

    try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, null, null)) {
      Iterable<? extends JavaFileObject> units =
          fileManager.getJavaFileObjectsFromFiles(javaFiles.stream().map(Path::toFile).toList());

      var options = List.of(
          "-classpath", System.getProperty("java.class.path"),
          "-d", outputDir.toString());

      var success = compiler.getTask(null, fileManager, diagnostics, options, null, units).call();
      var messages = diagnostics.getDiagnostics().stream()
          .map(Object::toString)
          .collect(Collectors.joining(System.lineSeparator()));
      assertTrue(Boolean.TRUE.equals(success), () -> "Generated DTO compilation failed:" + System.lineSeparator() + messages);
    }
  }
}