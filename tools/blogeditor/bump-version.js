'use strict';

const fs = require('fs');
const path = require('path');

const PACKAGE_JSON_PATH = path.join(__dirname, 'package.json');

/**
 * Parses a semantic version string and bumps the patch number.
 * @param {string} version
 * @returns {string}
 */
function bumpPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid version format: "${version}". Expected x.y.z`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]) + 1;
  return `${major}.${minor}.${patch}`;
}

/**
 * Reads package.json, increments patch version, and writes the updated file.
 */
function main() {
  const raw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
  const pkg = JSON.parse(raw);

  if (typeof pkg.version !== 'string') {
    throw new Error('package.json is missing a valid string version field.');
  }

  const previous = pkg.version;
  const next = bumpPatchVersion(previous);
  pkg.version = next;

  fs.writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 4)}\n`, 'utf8');
  console.log(`[blog-editor] version bumped: ${previous} -> ${next}`);
}

main();
