import { defineConfig } from 'tsup';

export default defineConfig((options) => {
  return {
    entry: [
      'src/index.ts',
    ],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: options.watch ? true : undefined,
    minify: !options.watch ? 'terser' : false,
    clean: true,
    target: 'node18',
    terserOptions: {
      parse: {},
      compress: {
        arguments: true,
        drop_console: true,
        ecma: 2020,
        hoist_funs: true,
        module: true,
      },
      mangle: {
        eval: true,
      },
      format: {
        braces: true,
        indent_level: 0,
      },
      ecma: 2020,
      enclose: false,
      keep_classnames: false,
      keep_fnames: false,
      ie8: false,
      module: true,
      nameCache: {},
      safari10: false,
      toplevel: false,
    },
  };
});