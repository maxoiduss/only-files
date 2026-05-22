const esbuild = require('esbuild');
const fs = require('fs');

const outDir = 'dist';
const metaFile = 'out/meta.json';

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
  plugins: [metaPlugin],
  metafile: true,                     // generate metadata for analysis
  mainFields: ['main'],
  conditions: ['node'],               // ensure node-specific code is used
  packages: 'bundle',                 // force bundling of all packages
  sourcemap: true,                    // required for debugging
  sourcesContent: true,               // binding to the source code
  minify: false                       // optional, usually off for extensions
}).catch(() => process.exit(1));