const { glob } = require("glob");
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const outDir = 'dist';
const metaFile = 'dist/meta.json';

const isTests = process.argv.includes('--tests');
const isWatch = process.argv.includes('--watch');
const isWeb   = process.argv.includes('--web')
             || process.env.BUILD_TARGET === 'web';

const testStubsImportMap = {
  'utilManager': './src/tests/helpers/utils.ts',
  'fileItemManager': './src/tests/helpers/manager.ts'
};

const aliasImportPlugin = {
  name: 'alias-import-map',
  setup(build) {
    const { basenameToMock, mockAbsolutePaths } = (() => {
      const basenameToMock = new Map();
      const mockAbsolutePaths = new Set();

      for (const [origRel, mockRel] of Object.entries(testStubsImportMap)) {
        const basename = path.basename(origRel, path.extname(origRel));
        const mockAbs = path.resolve(__dirname, mockRel);
        basenameToMock.set(basename, mockAbs);
        mockAbsolutePaths.add(mockAbs);
      }
      return { basenameToMock, mockAbsolutePaths };
    })();

    const filter = new RegExp(
      `(${[...basenameToMock.keys()].join('|')})(\\.ts|\\.js)?$`
    );

    build.onResolve({ filter }, (args) => {
      if (args.importer && mockAbsolutePaths.has(args.importer)) {
        return;
      }

      const base = path.basename(args.path, path.extname(args.path));
      const mockPath = basenameToMock.get(base);
      if (mockPath) {
        return { path: mockPath };
      }
    });
  },
};

const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`
            ${location.file}:${location.line}:${location.column}:`
          );
        }
      });
      console.log('[watch] build finished');
    });
  },
};

const metaPlugin = {
  name: 'meta-generator',
  setup(build) {
    build.onEnd((result) => {
      if (result.metafile) {
        fs.writeFileSync(metaFile, JSON.stringify(result.metafile, null, 2));
      }
    });
  },
};

const sharedOptions = {
  bundle: true,                         /// bundle dependencies
  platform: isWeb ? 'browser' : 'node', /// VS Code extensions run in Node
  format: 'cjs',
  external: [
    'vscode',                           /// keep VS Code API external
    'mocha',
    "sinon",
    "chai",
    '@vscode/test-electron',
    '@vscode/test-cli'
  ],
  metafile: true,                       /// generate metadata for analysis
  conditions: isWeb ? [                 /// ensure node-specific code is used
    'browser'
  ] : ['node'],
  packages: 'bundle',                   /// force bundling of all packages
  sourcemap: true,                      /// required for debugging
  sourcesContent: true,                 /// binding to the source code
  minify: false                         /// usually off for extensions
};

const buildOptions = async () => {
  return {
  ...sharedOptions,
  target: 'es2024',
  mainFields: isWeb ? [
    'browser',
    'module',
    'main'
  ] : ['main'],
  plugins: [
    metaPlugin,
    esbuildProblemMatcherPlugin
  ],
  entryPoints: [
    'src/extension.ts'
  ],
  outfile: `${outDir}/extension${isWeb ? ".web.js" : ".js"}` };
};

const testsOptions = async () => {
  const tests = await glob("src/tests/**/*.test.ts");

  return {
  ...sharedOptions,
  entryPoints: tests,
  format: "cjs",
  target: "es2022",
  outdir: "dist/tests",
  mainFields: ['main'],
  plugins: [
    metaPlugin,
    aliasImportPlugin,                  /// replace original funcs by mocked
    esbuildProblemMatcherPlugin
  ],
  banner: {                             /// inject vscode variable globally
    js: `
      var vscode = require("vscode");
      globalThis.vscode = vscode;
    ` }
  };
};

const run = () => isTests ? testsOptions() : buildOptions();
const see = `${isWeb ? 'WEB' : 'DESKTOP'}`;

if (isWatch) {
  run()
    .then((options) => esbuild.context(options))
    .then((context) => {
      console.log(
        `[esbuild] Watching for ${see} changes...`);
      return context.watch();
    })
    .catch((err) => { console.error(err); process.exit(1); });
} else {
  run()
    .then((options) => esbuild.build(options))
    .then(() => {
      console.log(
        `[esbuild] ${see} single build complete.`);
    })
    .catch((err) => { console.error(err); process.exit(1); });
}