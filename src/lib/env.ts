// Carga el .env, si hay, sin pisar lo que ya viene en el entorno (index.ts
// le pasa variables propias al proceso hijo y esas tienen que ganar).
//
// Es lo que hacía `dotenv`, con lo que Node trae desde la 20.12: el mismo
// formato —comillas, comentarios, `export`— y una dependencia menos, que
// además imprimía un aviso suyo en cada arranque. Va como primer import de los
// puntos de entrada, para que corra antes de que nadie lea process.env.

try {
  process.loadEnvFile()
} catch {
  // Sin .env: todo viene del entorno, o de los valores por defecto de config.ts.
}
