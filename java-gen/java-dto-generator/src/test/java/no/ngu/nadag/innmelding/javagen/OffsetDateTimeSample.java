package no.ngu.nadag.innmelding.javagen;

import jakarta.json.bind.annotation.JsonbDateFormat;
import java.time.OffsetDateTime;

public class OffsetDateTimeSample {
  
  private OffsetDateTime offsetDateTime;

  public OffsetDateTime getOffsetDateTime() {
    return offsetDateTime;
  }
  
  @JsonbDateFormat(value = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX['['VV']']")
  public void setOffsetDateTime(OffsetDateTime offsetDateTime) {
    this.offsetDateTime = offsetDateTime;
  }
}
