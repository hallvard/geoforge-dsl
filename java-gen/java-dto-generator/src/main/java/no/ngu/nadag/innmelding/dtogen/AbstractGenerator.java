package no.ngu.nadag.innmelding.dtogen;

import de.interactive_instruments.ShapeChange.Model.ClassInfo;
import de.interactive_instruments.ShapeChange.Model.Model;
import de.interactive_instruments.ShapeChange.Model.PropertyInfo;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * Generates Java DTO source code for a model.
 */
public abstract class AbstractGenerator<T> {
  
  protected final Model model;

  protected Map<ClassInfo, Collection<PropertyInfo>> ownerProperties = new HashMap<>();
  protected Map<ClassInfo, Collection<PropertyInfo>> ownedProperties = new HashMap<>();
  protected Map<ClassInfo, T> generated = new HashMap<>();
  protected Map<ClassInfo, Collection<ClassInfo>> subclasses = new HashMap<>();
  protected Set<ClassInfo> containedClasses = new HashSet<>();

  /**
   * Initializes the generator with a model.
   */
  protected AbstractGenerator(Model model) {
    this.model = model;
    Function<ClassInfo, Collection<PropertyInfo>> newArrayList = classInfo ->  new ArrayList<>();
    for (var assoc : model.associations()) {
      System.out.println("Association: "
          + assoc.end1().inClass().name() + "."
          + assoc.end1().name()
          + (assoc.end1().isComposition() ? "#" : "")
          + (assoc.end1().isAggregation() ? "*" : "")
          + " -> "
          + assoc.end2().inClass().name() + "."
          + assoc.end2().name()
          + (assoc.end2().isComposition() ? "#" : "")
          + (assoc.end2().isAggregation() ? "*" : "")
      );
      if (assoc.end1().isComposition() || assoc.end1().isAggregation()) {
        ownerProperties
            .computeIfAbsent(assoc.end1().inClass(), newArrayList)
            .add(assoc.end1());
        ownedProperties
            .computeIfAbsent(assoc.end2().inClass(), newArrayList)
            .add(assoc.end2());
      }
      if (assoc.end2().isComposition() || assoc.end2().isAggregation()) {
        ownerProperties
            .computeIfAbsent(assoc.end2().inClass(), newArrayList)
            .add(assoc.end2());
        ownedProperties
            .computeIfAbsent(assoc.end1().inClass(), newArrayList)
            .add(assoc.end1());
      }
    }
  }

  public void clear() {
    this.generated.clear();
  }

  protected void registerSubclass(ClassInfo subclass, ClassInfo superclass) {
    var subclasses = this.subclasses.get(superclass);
    if (subclasses == null) {
      subclasses = new ArrayList<ClassInfo>();
      this.subclasses.put(superclass, subclasses);
    }
    if (! subclasses.contains(subclass)) {
      subclasses.add(subclass);
      for (var supersuperclass : superclass.supertypeClasses()) {
        registerSubclass(subclass, supersuperclass);
      }
    }
  }

  protected void registerContainedClass(ClassInfo containedClass) {
    containedClasses.add(containedClass);
  }

  protected boolean isContainedClass(ClassInfo clazz) {
    return containedClasses.contains(clazz);
  }

  protected T registerGenerated(ClassInfo classInfo, T t) {
    generated.put(classInfo, t);
    return t;
  }

  protected boolean isGenerated(ClassInfo clazz) {
    return generated.containsKey(clazz);
  }

  public static boolean isCodeliste(ClassInfo classInfo) {
    return classInfo.stereotype("codelist");
  }

  public static boolean isDatatype(ClassInfo classInfo) {
    return classInfo.stereotype("datatype");
  }

  public static boolean isFeaturetype(ClassInfo classInfo) {
    return classInfo.stereotype("featuretype");
  }

  protected void generateForCodeList(ClassInfo classInfo) {
  }

  protected void generateForDataType(ClassInfo classInfo) {
  }

  protected void generateForFeatureType(ClassInfo classInfo) {
  }

  protected void generateFor(ClassInfo classInfo, String stereotype) {
    switch (stereotype) {
      case null -> System.out.println("...not stereotype");
      case "codelist" -> generateForCodeList(classInfo);
      case "datatype" -> generateForDataType(classInfo);
      case "featuretype" -> generateForFeatureType(classInfo);
      default -> System.out.println("...not supported, yet");
    }
  }

  /**
   * Main entry point for generating an artifactor for a model class.
   *
   * @param classInfo the model class
   */
  public void generateFor(ClassInfo classInfo) {
    if (! generated.containsKey(classInfo)) {
      // preprocessing
      for (var superType : classInfo.supertypeClasses()) {
        registerSubclass(classInfo, superType);
      }
      // register contained classes, using various tactics
      var ownedProperties = this.ownedProperties.getOrDefault(classInfo, List.of());
      for (var prop : classInfo.properties().values()) {
        var propTypeInfo = prop.typeClass();
        if (prop.isComposition() && propTypeInfo != null) {
          registerContainedClass(propTypeInfo);
        } else if (! ownedProperties.contains(prop)) {
          registerContainedClass(propTypeInfo);
        }
      }
      for (var prop : this.ownerProperties.getOrDefault(classInfo, List.of())) {
        var propTypeInfo = prop.typeClass();
        registerContainedClass(propTypeInfo);
      }

      if (isCodeliste(classInfo)) {
        generateFor(classInfo, "codelist");
      } else if (isDatatype(classInfo)) {
        generateFor(classInfo, "datatype");
      } else if (isFeaturetype(classInfo)) {
        generateFor(classInfo, "featuretype");
      } else {
        generateFor(classInfo, null);
      }
    }
  }
}
