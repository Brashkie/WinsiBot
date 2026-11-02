// Un error que el usuario tiene que ver.
//
// Cuando un comando falla por algo que tiene arreglo —falta un programa en el
// servidor, un servicio no responde—, el usuario no recibía nada y en el log
// quedaba un ERROR con la traza entera. Con esto el comando lanza el aviso, el
// handler lo contesta en el chat y deja una sola línea en el log, que dice qué
// hacer (ver handler.ts, "Ejecutar comando").

export class AvisoAlUsuario extends Error {
  constructor(
    /** Lo que se le contesta en el chat. */
    readonly paraElUsuario: string,
    /** Lo que va al log: qué pasó y cómo se arregla. */
    paraElLog: string,
  ) {
    super(paraElLog)
    this.name = 'AvisoAlUsuario'
  }
}
