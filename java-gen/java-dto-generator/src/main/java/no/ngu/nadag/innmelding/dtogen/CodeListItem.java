package no.ngu.nadag.innmelding.dtogen;

import jakarta.json.bind.adapter.JsonbAdapter;
import java.lang.String;

/**
 * An interface for code list items, providing methods to get the label and code.
 * Must be copied to appropriate DTO module to be accessible from generated code.
 */
public interface CodeListItem {

  /**
   * The label of the code list item.
   *
   * @return the label
   */
  String getLabel();

  /**
   * A generic JSON-B adapter for enums that supports case-insensitive deserialization.
   *
   * @param <E> the enum type
   */
  public abstract class AbstractJsonbAdapter<E extends Enum<E>>
      implements JsonbAdapter<E, String> {

    private final Class<E> enumType;

    public AbstractJsonbAdapter(Class<E> enumType) {
      this.enumType = enumType;
    }

    @Override
    public String adaptToJson(E enumValue) {
      return enumValue != null ? enumValue.name() : null;
    }

    /**
     * Matches constant name or label in a case-insensitive manner.
     * Overridable for custom matching logic.
     *
     * @param expected the expected value
     * @param json the JSON value
     * @return true if the values match, false otherwise
     */
    protected boolean matches(String expected, String json) {
      return expected.equalsIgnoreCase(json);
    }

    @Override
    public E adaptFromJson(String json) {
      if (json == null || json.trim().isEmpty()) {
        return null;
      }
      for (E enumConstant : enumType.getEnumConstants()) {
        if (matches(enumConstant.name(), json)) {
          return enumConstant;
        }
        if (enumConstant instanceof CodeListItem cli && matches(cli.getLabel(), json)) {
          return enumConstant;
        }
      }
      throw new IllegalArgumentException(json + " is not a valid constant for " + enumType);
    }
  }
}
