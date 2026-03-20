package no.ngu.nadag.innmelding.javagen;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import jakarta.json.bind.Jsonb;
import jakarta.json.bind.JsonbBuilder;
import org.junit.jupiter.api.Test;


public class OffsetDateTimeSampleTest {
  
  private Jsonb jsonb = JsonbBuilder.create();

  private String sampleJson = """
      {
        "offsetDateTime": "2023-10-01T12:30:02.500+02:00[Europe/Oslo]"
      }
      """;

  @Test
  public void testFromJsonb() {
    OffsetDateTimeSample sample = jsonb.fromJson(sampleJson, OffsetDateTimeSample.class);
    assertNotNull(sample.getOffsetDateTime(), "OffsetDateTime should not be null after deserialization");
  }

  @Test
  public void testToJsonb() {
    OffsetDateTimeSample sample = jsonb.fromJson(sampleJson, OffsetDateTimeSample.class);
    String json = jsonb.toJson(sample);
    assertFalse(json.contains("[") || json.contains("]"), "OffsetDateTime should not contain timezone in JSON output");
  }
}
