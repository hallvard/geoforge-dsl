package geoforge.model;

import static org.junit.jupiter.api.Assertions.assertSame;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import geoforge.model.GeoForge.BuiltinType;
import geoforge.model.GeoForge.CompositeTypeProperty;
import geoforge.model.GeoForge.DataType;
import geoforge.model.GeoForge.CodeListType;
import geoforge.model.GeoForge.CodeListItem;
import geoforge.model.GeoForge.GeoForgeType;
import geoforge.model.GeoForge.LayerType;
import geoforge.model.GeoForge.Model;
import geoforge.model.GeoForge.ModelElementInfo;
import geoforge.model.GeoForge.Multiplicity;
import geoforge.model.GeoForge.Namespace;
import geoforge.model.GeoForge.Tag;
import geoforge.model.GeoForge.TypeRef;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.util.List;
import org.junit.jupiter.api.Test;

public class GeoForgeTest {
  
  private ObjectMapper objectMapper = new ObjectMapper();

  private BuiltinType stringType = new BuiltinType(new ModelElementInfo("string"));

  private BuiltinType intType = new BuiltinType(new ModelElementInfo("integer"));

  private CodeListType enumType = new CodeListType(
      new ModelElementInfo("TestEnum"),
      List.of(
          new CodeListItem(new ModelElementInfo("LITERAL1"), "LITERAL1"),
          new CodeListItem(new ModelElementInfo("LITERAL2"), "LITERAL2")
      )
  );

  private Model createSampleModel() {
    var dataType = new DataType(
        "DataType1",
        false,
        null,
        List.of(new CompositeTypeProperty(
            "name",
            null,
            new TypeRef<GeoForge.GeoForgeType>(stringType.nameString()),
            GeoForge.Multiplicity.EXACTLY_ONE,
            null
          ),
          new CompositeTypeProperty(
            "age",
            null,
            new TypeRef<GeoForgeType>(intType.nameString()),
            Multiplicity.ZERO_OR_ONE,
            null
          )
        )
    );
    var layerType = new LayerType(
        "LayerType1",
        false,
        null,
        List.of(new CompositeTypeProperty(
            "id",
            CompositeTypeProperty.Kind.ID,
            new TypeRef<GeoForge.GeoForgeType>(stringType.nameString()),
            GeoForge.Multiplicity.EXACTLY_ONE,
            null
          ), new CompositeTypeProperty(
            "data",
            null,
            new TypeRef<GeoForge.GeoForgeType>(dataType.nameString()),
            GeoForge.Multiplicity.ZERO_OR_ONE,
            null
          )
        )
    );

    var model = new Model(new ModelElementInfo("test.Model"));
    model.addType(stringType);
    model.addType(intType);
    model.addType(enumType);
    model.addType(dataType);
    model.addType(layerType);
    model.tags().add(Tag.of("tag", "value"));
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
    var model = objectMapper.readValue(json, Namespace.class);
    System.out.println(model);
  }
  
  private Namespace loadJson(String source) throws IOException,JsonProcessingException {
    URL url = (source.indexOf(":") > 3) ? URI.create(source).toURL() : getClass().getResource(source);
    try (var inputStream = url.openStream()) {
      return objectMapper.readValue(inputStream, Namespace.class);
    }
  }

  @Test
  public void testJsonDeserializationFromFile() throws IOException, JsonProcessingException {
    var model = loadJson("/samples/test.geoforge.json");
    System.out.println(model);
  }
}
