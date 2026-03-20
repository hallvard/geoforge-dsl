import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(scriptDir, '..');
const repositoryRoot = path.resolve(extensionDir, '..', '..', '..');
const generatorProjectDir = path.join(repositoryRoot, 'java-gen', 'java-dto-generator');
const generatorTargetDir = path.join(repositoryRoot, 'java-gen', 'java-dto-generator', 'target');
const destinationDir = path.join(extensionDir, 'resources', 'java-dto-generator');
const destinationJar = path.join(destinationDir, 'java-dto-generator.jar');
const destinationLibsDir = path.join(destinationDir, 'libs');
const destinationConfigDir = path.join(destinationDir, 'config');

const jarPath = findLatestGeneratorJar(generatorTargetDir);
if (!jarPath) {
  console.log('[build:prepare] Java DTO generator jar not found in java-gen/java-dto-generator/target; skipping bundle copy.');
  process.exit(0);
}

await fsp.mkdir(destinationDir, { recursive: true });
await fsp.copyFile(jarPath, destinationJar);
console.log(`[build:prepare] Bundled Java DTO generator jar: ${path.relative(extensionDir, destinationJar)}`);

const sourceLibsDir = findGeneratorLibsDirectory(generatorTargetDir);
if (sourceLibsDir) {
  await fsp.rm(path.join(destinationDir, 'lib'), { recursive: true, force: true });
  await fsp.rm(destinationLibsDir, { recursive: true, force: true });
  await fsp.cp(sourceLibsDir, destinationLibsDir, { recursive: true });
  console.log(`[build:prepare] Bundled Java DTO generator libs: ${path.relative(extensionDir, destinationLibsDir)}`);
} else {
  console.log('[build:prepare] Java DTO generator dependency folder not found (expected target/lib or target/libs).');
}

const configTemplates = ['java-dto-v1.xml', 'shapechange-to-geoforge.xml'];
await fsp.mkdir(destinationConfigDir, { recursive: true });
for (const configTemplate of configTemplates) {
  const sourceConfigPath = path.join(generatorProjectDir, configTemplate);
  if (!fs.existsSync(sourceConfigPath)) {
    console.log(`[build:prepare] Config template not found, skipping: ${sourceConfigPath}`);
    continue;
  }
  const destinationConfigPath = path.join(destinationConfigDir, configTemplate);
  await fsp.copyFile(sourceConfigPath, destinationConfigPath);
  console.log(`[build:prepare] Bundled ShapeChange config template: ${path.relative(extensionDir, destinationConfigPath)}`);
}

function findLatestGeneratorJar(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return undefined;
  }

  const candidateFiles = fs.readdirSync(targetDir)
    .filter((name) => /^java-dto-generator-.*\.jar$/.test(name))
    .map((name) => path.join(targetDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());

  if (candidateFiles.length === 0) {
    return undefined;
  }

  candidateFiles.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return candidateFiles[0];
}

function findGeneratorLibsDirectory(targetDir) {
  const candidates = [path.join(targetDir, 'libs'), path.join(targetDir, 'lib')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return undefined;
}
