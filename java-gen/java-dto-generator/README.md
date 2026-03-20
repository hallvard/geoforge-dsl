# Java DTO generator based on ShapeChange 

## Setup

Start by locating `eaapi.jar` in the Java API folder in your EA installation.
Note that its license prohibits storing it in the repo.

Then run the following command to add it to your local maven repository, after replacing the eaapi.jar path
(the one below is from WSL to a default installation):

```
mvn install:install-file -Dfile="eaapi.jar" -D"groupId=org.sparx" -DartifactId=eaapi -D"version=16.1.1628" -Dpackaging=jar
```

## Export ea model to standard ShapeChange format (scxml):

Transforming EA models can only be done on Windows, so we first transform from eap(x) to ShapeChange's native xml format
(called scxml, but still using xml as file extension) on Windows and then use scxml as input to other transformations.

* run `mvn package` first, to populate `target/lib`. 
* edit `ea-to-shapechange.xml` so input and output file names are correct
* run shapechange engine

```
java -cp "target/lib/*" de.interactive_instruments.ShapeChange.Main -c ea-to-shapechange.xml
```

The (character) encoding will be Windows-specific, so there is a jbang script to fix it, typically translate to UTF.
There is special logic to handle characters that didn't survive the first transformation, like the omega symbol.

E.g. the following converts from the encoding declared in the XML header to UTF-8:

```
jbang jbang/FixEncoding.java -i INPUT/Grunnundersøkelser_v11-windows1252.xml -o INPUT/Grunnundersøkelser_v11-utf8.xml
```

## Usage

* build generator `mvn clean package`
* create/edit config-file (e.g. see `v1.xml`)
* run shapechange with custom java generator target

```
java -jar target/java-dto-generator-1.0-SNAPSHOT.jar -c java-dto-v1.xml
```

### Generating DTO classes with java-dto-v1.xml

The generator outputs classes in target/generated-sources.
If the source (tree) looks OK it can be copied to the `nadag-full-v1-api` module.
In addition, the CodeListItem interface in the generator source tree, must also be copied, since the generated one is incomplete.

### Generating export support with db-schema.xml and db-exporter.xml

`db-schema.xml` is used for generating postgis schema for the export tables.
`db-exporter.xml` generates an exporter class.

The generated artifacts, sql file and Java class, must be copied into the `gu-exporter` module.

## Dependencies

* [ShapeChange](https://shapechange.github.io/ShapeChange/3.1.0/) - the transformation engine, supports EA 7 models
* [JavaPoet](https://github.com/palantir/javapoet) - java source generation API. supports classes with members and code block structure
* [Jakarta Validation](https://beanvalidation.org/) - annotations for declaring bean constraints
* [MicroProfile OpenApi](https://github.com/eclipse/microprofile-open-api) - annotations for API documentation
