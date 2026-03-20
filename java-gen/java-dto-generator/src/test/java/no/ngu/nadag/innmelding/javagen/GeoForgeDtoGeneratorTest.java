package no.ngu.nadag.innmelding.javagen;

import static org.junit.jupiter.api.Assertions.assertTrue;

import geoforge.model.GeoForge;
import geoforge.model.GeoForge.CodeListItem;
import geoforge.model.GeoForge.CodeListType;
import geoforge.model.GeoForge.CompositeTypeProperty;
import geoforge.model.GeoForge.DataType;
import geoforge.model.GeoForge.LayerType;
import geoforge.model.GeoForge.Model;
import geoforge.model.GeoForge.ModelElementInfo;
import geoforge.model.GeoForge.Multiplicity;
import geoforge.model.GeoForge.TypeRef;
import java.nio.file.Files;
import no.ngu.nadag.innmelding.dtogen.GeoForgeDtoGenerator;
import org.junit.jupiter.api.Test;

class GeoForgeDtoGeneratorTest {

  @Test
  void writesDtosFromGeoForgeModel() throws Exception {
    var model = sampleModel();
    var outputDir = Files.createTempDirectory("geoforge-dto-test");

    var generator = new GeoForgeDtoGenerator("no.ngu.generated");
    generator.writeFromModel(model, outputDir);

    var dataTypeFile = outputDir.resolve("no/ngu/generated/ngu/nadag/Identifikasjon.java");
    var codeListFile = outputDir.resolve("no/ngu/generated/ngu/nadag/HoleType.java");
    var layerTypeFile = outputDir.resolve("no/ngu/generated/ngu/nadag/GB.java");

    assertTrue(Files.exists(dataTypeFile), "Expected generated data type");
    assertTrue(Files.exists(codeListFile), "Expected generated code list");
    assertTrue(Files.exists(layerTypeFile), "Expected generated layer type");
  }

  private static Model sampleModel() {
    var model = new GeoForge.Model(new ModelElementInfo("ngu.nadag"));

    var idType = new DataType(
        new ModelElementInfo("ngu.nadag.Identifikasjon"),
        false,
        null,
        java.util.List.of(
            new CompositeTypeProperty(
                new ModelElementInfo("id"),
                CompositeTypeProperty.Kind.CONTAINMENT,
                new TypeRef<>("geoforge.lib.String"),
                Multiplicity.EXACTLY_ONE,
                null)));

    var holeType = new CodeListType(
        new ModelElementInfo("ngu.nadag.HoleType"),
        java.util.List.of(
            new CodeListItem(new ModelElementInfo("UNKNOWN"), "0"),
            new CodeListItem(new ModelElementInfo("DRILLED"), "1")));

    var gb = new LayerType(
        new ModelElementInfo("ngu.nadag.GB"),
        false,
        null,
        java.util.List.of(
            new CompositeTypeProperty(
                new ModelElementInfo("identifikasjon"),
                CompositeTypeProperty.Kind.ID,
                new TypeRef<>("ngu.nadag.Identifikasjon"),
                Multiplicity.EXACTLY_ONE,
                null),
            new CompositeTypeProperty(
                new ModelElementInfo("holeType"),
                CompositeTypeProperty.Kind.CONTAINMENT,
                new TypeRef<>("ngu.nadag.HoleType"),
                Multiplicity.EXACTLY_ONE,
                null)));

    model.addType(idType);
    model.addType(holeType);
    model.addType(gb);
    return model;
  }
}
