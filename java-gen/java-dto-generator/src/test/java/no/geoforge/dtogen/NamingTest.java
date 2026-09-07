package no.geoforge.dtogen;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.palantir.javapoet.FieldSpec;
import com.palantir.javapoet.TypeName;
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

  @Test
  public void testGetterNameForPrimitiveBoolean() {
    var field = FieldSpec.builder(TypeName.BOOLEAN, "active").build();
    assertEquals("isActive", naming.toGetterName(field));
  }

  @Test
  public void testGetterNameForBoxedBoolean() {
    var field = FieldSpec.builder(TypeName.BOOLEAN.box(), "active").build();
    assertEquals("getActive", naming.toGetterName(field));
  }

  @Test
  public void testGetterNameForIsPrefixedPrimitiveBoolean() {
    var field = FieldSpec.builder(TypeName.BOOLEAN, "isActive").build();
    assertEquals("isActive", naming.toGetterName(field));
  }
}
