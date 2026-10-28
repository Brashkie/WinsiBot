// Carga el .env para los scripts de consola, igual que src/lib/env.ts para el
// bot: con lo que Node trae desde la 20.12, sin pisar lo que ya viene en el
// entorno. Hasta la 8.18.0 los scripts importaban `dotenv`, que salió de las
// dependencias en la 8.17.0: `npm run manage` y otros cinco no arrancaban.

try {
  process.loadEnvFile()
} catch {
  // Sin .env: todo viene del entorno.
}
