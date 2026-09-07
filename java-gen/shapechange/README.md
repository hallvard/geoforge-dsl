# Generate GeoForge model from ShapeChange

## Setup

Assumes a ShapeChange file is already generated, e.g. from Enterprise Architect model.

## Usage

* build generator `mvn clean package`
* run ShapeChange with generator target

```
java -jar target/shapechange-1.0-SNAPSHOT.jar -c shapechange-to-geoforge.xml
```
