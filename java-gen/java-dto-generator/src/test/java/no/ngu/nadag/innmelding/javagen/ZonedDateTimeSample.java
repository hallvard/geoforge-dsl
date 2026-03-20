package no.ngu.nadag.innmelding.javagen;

import jakarta.json.bind.annotation.JsonbDateFormat;
import java.time.ZonedDateTime;

public class ZonedDateTimeSample {
  
  private ZonedDateTime zonedDateTime;

  @JsonbDateFormat(value = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
  public ZonedDateTime getZonedDateTime() {
    return zonedDateTime;
  }

  public void setZonedDateTime(ZonedDateTime zonedDateTime) {
    this.zonedDateTime = zonedDateTime;
  }
}
