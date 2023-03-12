module.exports = {
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    root: true,
    rules: {
        "@typescript-eslint/no-unused-vars": [
            "error",
            {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }
        ],
        "@typescript-eslint/no-empty-function": 0,
        "@typescript-eslint/no-this-alias": 0,
        "@typescript-eslint/no-explicit-any": ["error"],
        "semi": ["error", "never"],
        "radix": ["error", "always"],
        "arrow-parens": ["error", "always"],
        "block-spacing": ["error", "always"],
        "indent": ["error", "tab"],
        "object-curly-spacing": ["error", "never"],
        "quotes": ["error", "double"],
        "no-shadow": ["error", {
            builtinGlobals: true,
        }]
    },
    ignorePatterns: [
        "**/*.test.ts", 
        "**/*.test.js",
        "**/*.test.mjs",
        "testLib",
        "node_modules",
        "public",
        "**/vite-env.d.ts",
        "prototype",
        "dist"
    ]
}