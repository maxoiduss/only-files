const esbuild = require('esbuild');

const outDir = 'dist';

esbuild.build({
  entryPoints: [
    'src/extension.ts'                // your entry file
  ],
  bundle: true,                       // bundle dependencies
  platform: 'node',                   // VS Code extensions run in Node
  target: 'es2024',                   // match VS Code’s runtime (es2024)
  format: 'cjs',
  outfile: `${outDir}/extension.js`,  // output file
  external: [
    'vscode',                         // keep VS Code API external
  ],
  inject: ['src/injections.js'],      // injects 'vscode' globally
  mainFields: ['main'],
  conditions: ['node'],               // ensure node-specific code is used
  packages: 'bundle',                 // force bundling of all packages
  sourcemap: true,                    // required for debugging
  sourcesContent: true,               // binding to the source code
  minify: false                       // optional, usually off for extensions
}).catch(() => process.exit(1));