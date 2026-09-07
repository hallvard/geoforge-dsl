package no.geoforge.dtogen;

import jakarta.json.bind.annotation.JsonbDateFormat;
import java.time.ZonedDateTime;

/**
 * Sample record with ZonedDateTime field for testing JSON-B serialization.
 */
public record ZonedDateTimeRecordSample(ZonedDateTime zonedDateTime) {

  @JsonbDateFormat(value = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
  @Override
  public ZonedDateTime zonedDateTime() {
    return zonedDateTime;
  }
}
