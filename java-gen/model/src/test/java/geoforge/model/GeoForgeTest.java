package geoforge.model;

import static org.junit.jupiter.api.Assertions.assertSame;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import geoforge.model.GeoForge.Model;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

public class GeoForgeTest {
  
  private ObjectMapper objectMapper = new ObjectMapper();

  private GeoForge.BuiltinType stringType = new GeoForge.BuiltinType(new GeoForge.ModelElementInfo("string", "String", "A string type"));

  private GeoForge.BuiltinType intType = new GeoForge.BuiltinType(new GeoForge.ModelElementInfo("integer", "Integer", "An integer type"));

  private GeoForge.EnumType enumType = new GeoForge.EnumType(
      new GeoForge.ModelElementInfo("TestEnum", "Test Enum", "A test enum type"),
      List.of(
          new GeoForge.EnumProperty(new GeoForge.ModelElementInfo("LITERAL1", "Literal 1", "First literal"), "LITERAL1"),
          new GeoForge.EnumProperty(new GeoForge.ModelElementInfo("LITERAL2", "Literal 2", "Second literal"), "LITERAL2")
      )
  );

  private Model createSampleModel() {
    var dataType = new GeoForge.CompositeType(
        new GeoForge.ModelElementInfo("TestType", "Test Type", "A test composite type"),
        false,
        GeoForge.CompositeTypeKind.DATATYPE,
        null,
        new ArrayList<>()
    );
    dataType.properties().add(new GeoForge.CompositeTypeProperty(
        new GeoForge.ModelElementInfo("name", "Name", "The name property"),
        null,
        new GeoForge.TypeRef<GeoForge.GeoForgeType>(stringType.nameString()),
        GeoForge.Multiplicity.EXACTLY_ONE,
        null
    ));
    dataType.properties().add(new GeoForge.CompositeTypeProperty(
        new GeoForge.ModelElementInfo("age", "Age", "The age property"),
        null,
        new GeoForge.TypeRef<GeoForge.GeoForgeType>(intType.nameString()),
        GeoForge.Multiplicity.ZERO_OR_ONE,
        null
    ));

    var model = new GeoForge.Model(new GeoForge.ModelElementInfo("test.Model", "Test Model", "A test model"));
    model.addType(stringType);
    model.addType(intType);
    model.addType(dataType);
    model.addType(enumType);
    model.tags().add(GeoForge.Tag.of("tag", "value"));
    return model;
  }

  @Test
  public void testGetType() throws JsonProcessingException {
    var model = createSampleModel();
    assertSame(enumType, model.getType(enumType.nameString()));
    assertSame(enumType, model.getType(enumType.info().name()));
  }

  @Test
  public void testJsonSerialization() throws JsonProcessingException {
    var json = objectMapper
        .writerWithDefaultPrettyPrinter()
        .writeValueAsString(createSampleModel());
    System.out.println(json);
  }
  
  @Test
  public void testJsonDeserialization() throws JsonProcessingException {
    var json = objectMapper
    .writerWithDefaultPrettyPrinter()
    .writeValueAsString(createSampleModel());
    System.out.println(json);
    var model = objectMapper.readValue(json, GeoForge.Namespace.class);
    System.out.println(model);
  }
}
