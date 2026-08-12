const esbuild = require('esbuild');
const fs = require('fs');

const outDir = 'dist';
const metaFile = 'out/meta.json';

const isWatch = process.argv.includes('--watch');
const isWeb   = process.argv.includes('--web')
             || process.env.BUILD_TARGET === 'web';

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
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
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

const buildOptions = {
  entryPoints: [
    'src/extension.ts'                // your entry file
  ],
  bundle: true,                       // bundle dependencies
  platform: isWeb ? 'browser' : 'node',                   // VS Code extensions run in Node
  target: 'es2024',                   // match VS Code’s runtime (es2024)
  format: 'cjs',
  outfile: `${outDir}/extension${isWeb ? ".web.js" : ".js"}`,
  external: [
    'vscode',                         // keep VS Code API external
    '@vscode/test-electron'
  ],
  plugins: [
    metaPlugin,
    esbuildProblemMatcherPlugin
  ],
  metafile: true,                     // generate metadata for analysis
  mainFields: isWeb ? [
    'browser',
    'module',
    'main'
  ] : ['main'],
  conditions: isWeb ? [               // ensure node-specific code is used
    'browser'
  ] : ['node'],
  packages: 'bundle',                 // force bundling of all packages
  sourcemap: true,                    // required for debugging
  sourcesContent: true,               // binding to the source code
  minify: false                       // optional, usually off for extensions
};

if (isWatch) {
  esbuild.context(buildOptions)
    .then((context) => {
      console.log(
        `[esbuild] Watching for ${isWeb ? 'WEB' : 'DESKTOP'} changes...`);
      return context.watch();
    })
    .catch(() => process.exit(1));
} else {
  esbuild.build(buildOptions)
    .then(() => {
      console.log(
        `[esbuild] ${isWeb ? 'Web' : 'Desktop'} single build complete.`);
    })
    .catch(() => process.exit(1));
}