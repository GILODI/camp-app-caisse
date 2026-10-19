import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Les tests tournent en local, sans réseau et sans toucher à la production :
// la base de données est un vrai Postgres en mémoire (voir tests/helpers/db.ts).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Le démarrage du moteur Postgres en mémoire prend 1 à 3 secondes.
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
