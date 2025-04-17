// IMPORTANT(1) we're using eslint.config.js as opposed to .eslintrc because
//              vscode failes to locate the latter for whatever reason.
// IMPORTANT(2) as of 13/9/2024, the @react-native plugin does not support
//              eslint v9, so we're using eslint v8

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  ...compat.extends("@react-native"),
  {
    rules: {
      quotes: ["warn", "double"],
      "react/react-in-jsx-scope": "off",
      curly: ["warn", "multi-line", "consistent"],
      "react-native/no-inline-styles": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
];
