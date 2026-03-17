import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: [".next/**", ".paper2agent/**", ".venv/**", "node_modules/**"]
  }
];

export default config;
