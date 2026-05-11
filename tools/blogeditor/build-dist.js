'use strict';

/**
 * Pre-builds the Milkdown Crepe JS + CSS bundles into .vscode/dist/
 * Run this before packaging the VSIX: node .vscode/build-dist.js
 */

const path    = require('path');
const fs      = require('fs');

// Resolve symlinks so node_modules lookup works even in junction'd paths
const ROOT     = fs.realpathSync(__dirname);
const DIST_DIR = path.join(ROOT, 'dist');

/**
 * Walks up from startDir to find node_modules containing a given package.
 * Returns null if not found (never throws).
 * @param {string} pkg
 * @param {string} startDir
 * @returns {string | null}
 */
function resolveFromNearestNodeModules(pkg, startDir) {
    let dir = startDir;
    while (true) {
        const candidate = path.join(dir, 'node_modules', pkg);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

// Walk up from __dirname until we find node_modules with esbuild.
// Also tries process.cwd() in case the script is in a stub folder without node_modules.
const esbuildEntry = resolveFromNearestNodeModules('esbuild', ROOT)
    ?? resolveFromNearestNodeModules('esbuild', process.cwd());
if (!esbuildEntry) throw new Error('Cannot find esbuild. Run this from the project root that contains node_modules.');
const esbuild      = require(path.join(esbuildEntry, 'lib', 'main.js'));
const crepeLib     = resolveFromNearestNodeModules('@milkdown/crepe', ROOT)
    ?? resolveFromNearestNodeModules('@milkdown/crepe', process.cwd());
const CREPE_DIR    = path.join(crepeLib, 'lib', 'theme');
// Also need the root for esbuild resolveDir (must contain node_modules/@milkdown)
const ROOT_DIR     = path.dirname(path.dirname(esbuildEntry));

const FONT_LOADERS = {
    '.woff2': 'dataurl',
    '.woff':  'dataurl',
    '.ttf':   'dataurl',
    '.eot':   'dataurl',
    '.svg':   'dataurl',
};

const TEXT_LOADERS = {
    '.aff': 'text',
    '.dic': 'text',
};

async function main() {
    fs.mkdirSync(DIST_DIR, { recursive: true });

    console.log('⏳ Bundling Milkdown JS…');
    const jsResult = await esbuild.build({
        stdin: { contents: `export { Crepe, CrepeFeature } from '@milkdown/crepe';`, resolveDir: ROOT_DIR, loader: 'js' },
        bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, write: false,
    });
    fs.writeFileSync(path.join(DIST_DIR, 'milkdown.js'), jsResult.outputFiles[0].contents);
    console.log(`✓  milkdown.js  ${(jsResult.outputFiles[0].contents.byteLength / 1024).toFixed(0)} KB`);

    console.log('⏳ Bundling common CSS…');
    const cssCommon = await esbuild.build({
        entryPoints: [path.join(CREPE_DIR, 'common', 'style.css')],
        bundle: true, write: false, loader: FONT_LOADERS,
    });
    fs.writeFileSync(path.join(DIST_DIR, 'milkdown-common.css'), cssCommon.outputFiles[0].contents);
    console.log(`✓  milkdown-common.css  ${(cssCommon.outputFiles[0].contents.byteLength / 1024).toFixed(0)} KB`);

    console.log('⏳ Bundling theme CSS…');
    const cssTheme = await esbuild.build({
        entryPoints: [path.join(CREPE_DIR, 'frame-dark', 'style.css')],
        bundle: true, write: false, loader: FONT_LOADERS,
    });
    fs.writeFileSync(path.join(DIST_DIR, 'milkdown-theme.css'), cssTheme.outputFiles[0].contents);
    console.log(`✓  milkdown-theme.css  ${(cssTheme.outputFiles[0].contents.byteLength / 1024).toFixed(0)} KB`);

    console.log('⏳ Bundling spellcheck JS…');
    const spellcheckJs = await esbuild.build({
        entryPoints: [path.join(ROOT, 'spellcheck.js')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        write: false,
        loader: TEXT_LOADERS,
    });
    fs.writeFileSync(path.join(DIST_DIR, 'spellcheck.js'), spellcheckJs.outputFiles[0].contents);
    console.log(`✓  spellcheck.js  ${(spellcheckJs.outputFiles[0].contents.byteLength / 1024).toFixed(0)} KB`);

    console.log('\n✓  dist/ ready — run: npx @vscode/vsce package --out blog-editor.vsix --no-dependencies');
}

main().catch(err => { console.error(err); process.exit(1); });
