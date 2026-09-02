import js from "@eslint/js";
import globals from "globals";

// server.js is one 9,600 line module, so a symbol that loses its definition - a bad merge, an
// over-eager delete - only shows up as a ReferenceError once that route is called in a browser.
// node --check cannot see it: the file still parses. no-undef can, which is the whole point of
// this config; the rest of recommended comes along because it costs nothing.
export default [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: globals.node,
        },
        rules: {
            // Warnings, not errors: both are real but neither breaks a request, and a check
            // that fails on pre-existing noise is a check nobody runs.
            "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
            "no-empty": "warn",
        },
    },
    { ignores: ["node_modules/**", "migrations/**"] },
];
