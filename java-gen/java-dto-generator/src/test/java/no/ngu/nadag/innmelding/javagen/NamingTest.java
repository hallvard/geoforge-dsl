package no.ngu.nadag.innmelding.javagen;

import static org.junit.jupiter.api.Assertions.assertEquals;

import no.ngu.nadag.innmelding.dtogen.DtoNaming;
import no.ngu.nadag.innmelding.dtogen.JavaNaming;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Test Naming class.
 */
public class NamingTest {
  
  private DtoNaming naming;

  @BeforeEach
  public void setup() {
    naming = new DtoNaming();
  }

  @Test
  public void testFullNameToPackageName() {
    assertEquals("no.ngu.abstrakte_featurtyper",
        naming.fullNameToPackageName("Model::Grunnundersøkelser-1.0_utkast::FeatureTypes"
            + "::Abstrakte Featurtyper::Supertype_Geotekn_obj_pkt", "no.ngu"));
    assertEquals("abstrakte_featurtyper",
        naming.fullNameToPackageName("Model::Grunnundersøkelser-1.0_utkast::FeatureTypes"
            + "::Abstrakte Featurtyper::Supertype_Geotekn_obj_pkt", null));
  }

  @Test
  public void testFixMemberName() {
    assertEquals("Name_Subname", JavaNaming.fixMemberName("Name$%Subname", "_", "_"));
  }
}
