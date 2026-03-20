package no.ngu.nadag.innmelding.javagen;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.json.bind.Jsonb;
import jakarta.json.bind.JsonbBuilder;
import org.junit.jupiter.api.Test;

/**
 * Test for ZonedDateTime JSON-B serialization and deserialization, and
 * the use of the @JsonbDateTimeFormat annotation.
 */
public class ZonedDateTimeSampleTest {
  
  private Jsonb jsonb = JsonbBuilder.create();

  private String sampleDate = "2023-10-01T12:30:02.500+02:00";

  private String sampleJson = """
      {
        "zonedDateTime": "%s[Europe/Oslo]"
      }
      """.formatted(sampleDate);

  @Test
  public void testFromJsonb() {
    ZonedDateTimeSample sample = jsonb.fromJson(sampleJson, ZonedDateTimeSample.class);
    assertNotNull(sample.getZonedDateTime(),
        "ZonedDateTime should not be null after deserialization");
  }

  @Test
  public void testRecordFromJsonb() {
    ZonedDateTimeRecordSample sample = jsonb.fromJson(sampleJson, ZonedDateTimeRecordSample.class);
    assertNotNull(sample.zonedDateTime(), "ZonedDateTime should not be null after deserialization");
  }

  @Test
  public void testToJsonb() {
    ZonedDateTimeSample sample = jsonb.fromJson(sampleJson, ZonedDateTimeSample.class);
    String json = jsonb.toJson(sample);
    assertTrue(json.contains("\"" + sampleDate + "\""));
    assertFalse(json.contains("[") || json.contains("]"),
        "ZonedDateTime should not contain timezone in JSON output");
  }

  @Test
  public void testRecordToJsonb() {
    ZonedDateTimeRecordSample sample = jsonb.fromJson(sampleJson, ZonedDateTimeRecordSample.class);
    String json = jsonb.toJson(sample);
    assertTrue(json.contains("\"" + sampleDate + "\""));
    assertFalse(json.contains("[") || json.contains("]"),
        "ZonedDateTime should not contain timezone in JSON output");
  }
}
