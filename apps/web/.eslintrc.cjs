module.exports = {
  root: true,
  extends: ["@nuxt/eslint-config", "plugin:vuejs-accessibility/recommended"],
  plugins: ["vuejs-accessibility"],
  rules: {
    // TODO enable these once prettier auto-formatting is working properly for them
    "vue/html-self-closing": ["off"],
    "vue/html-closing-bracket-newline": ["off"],
    "vue/first-attribute-linebreak": ["off"],
    "vue/max-attributes-per-line": ["off"],
    "vue/html-indent": ["off"],
    "vue/singleline-html-element-content-newline": ["off"],
    "vue/multiline-html-element-content-newline": ["off"],
    "vue/multi-word-component-names": ["off"],
  },
};
