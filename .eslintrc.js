const { configure, presets } = require('eslint-kit')

module.exports = configure({
  root: __dirname,
  allowDebug: process.env.NODE_ENV !== 'production',

  presets: [
    presets.imports(),
    presets.node(),
    presets.prettier(),
    presets.typescript(),
  ],

  extend: {
    ignorePatterns: ['!**/*', 'node_modules', 'dist'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
})
