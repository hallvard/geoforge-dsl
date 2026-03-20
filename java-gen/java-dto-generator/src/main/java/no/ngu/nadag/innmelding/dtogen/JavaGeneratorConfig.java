package no.ngu.nadag.innmelding.dtogen;

import java.util.Map;

/**
 * JSON configuration for Java DTO generation.
 */
public record JavaGeneratorConfig(
    String destinationFolder,
    String packagePrefix,
    Map<String, String> builtinTypeMappings
) {
}
