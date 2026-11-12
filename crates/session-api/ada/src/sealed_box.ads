--  Sellar y abrir datos con ChaCha20-Poly1305 (RFC 8439): cifra y además
--  autentica, así que un byte cambiado —o un archivo puesto en el lugar de
--  otro, porque el nombre va en los datos asociados— no se abre.
--
--  No es criptografía escrita acá: ChaCha20 y Poly1305 son los de SPARKNaCl,
--  de Rod Chapman, una reimplementación de TweetNaCl en SPARK con la ausencia
--  de errores de ejecución demostrada. Esta unidad los compone como dice el
--  RFC 8439 §2.8 —la clave de un solo uso del bloque 0, el cifrado desde el
--  bloque 1 y Poly1305 sobre los datos asociados, el cifrado y los dos largos—
--  y los ofrece por la ABI de C; lo usa la Session API para sellar sus
--  respaldos de la sesión de WhatsApp (src/seal.rs). Es la misma
--  construcción que `chacha20-poly1305` de Node, con la que el bot sella
--  auth/: lo que sella uno lo abre el otro.
--
--  No usa el AEAD ya armado de SPARKNaCl (Secretbox.Create) porque arma el
--  mensaje de Poly1305 concatenando arreglos, y eso pide la pila secundaria
--  del runtime de GNAT, que no se enlaza dentro de la Session API. Acá ese
--  mensaje se arma en un búfer de trabajo que pasa quien llama.
--
--  GNATprove demuestra que no hay errores de ejecución para ninguna entrada:
--  un largo fuera de rango devuelve un código y no lee nada, el mensaje de
--  Poly1305 entra en el búfer de trabajo, y lo que se le pasa a SPARKNaCl
--  cumple sus precondiciones. Las claves se borran al salir, y la etiqueta se
--  compara en tiempo constante.
--
--  Pure y sin elaboración, como las demás unidades: se enlaza por la ABI de C.

with Interfaces;
with SPARKNaCl;

package Sealed_Box
  with SPARK_Mode, Pure
is
   use type Interfaces.Integer_32;

   --  Un creds.json mide ~3 KB; el tope deja lugar de sobra.
   Max_Datos : constant := 1_048_576;
   Max_Aad   : constant := 256;
   --  Los datos asociados y el cifrado, cada uno rellenado a 16, y los dos
   --  largos de 8 bytes.
   Max_Trabajo : constant := Max_Aad + Max_Datos + 16;

   subtype Datos is SPARKNaCl.Byte_Seq (0 .. Max_Datos - 1);
   subtype Asociados is SPARKNaCl.Byte_Seq (0 .. Max_Aad - 1);
   subtype Trabajo is SPARKNaCl.Byte_Seq (0 .. Max_Trabajo - 1);

   --  Lo que devuelven: 0 bien, 1 un largo fuera de rango, 2 la etiqueta no
   --  coincide (otra clave, otro nombre, o un byte cambiado).
   Bien         : constant := 0;
   Fuera_Rango  : constant := 1;
   No_Coincide  : constant := 2;

   --  void winsi_aead_sellar(const uint8_t clave[32], const uint8_t nonce[12],
   --      const uint8_t aad[256], int32_t largo_aad,
   --      const uint8_t m[1048576], int32_t largo,
   --      uint8_t c[1048576], uint8_t etiqueta[16],
   --      uint8_t trabajo[1048848], int32_t *estado);
   --
   --  Los largos van de 1 al tope. Escribe el cifrado en c (0 .. largo - 1).
   procedure Sellar_C
     (Clave     : SPARKNaCl.Bytes_32;
      Nonce     : SPARKNaCl.Bytes_12;
      Aad       : Asociados;
      Largo_Aad : Interfaces.Integer_32;
      M         : Datos;
      Largo     : Interfaces.Integer_32;
      C         : out Datos;
      Etiqueta  : out SPARKNaCl.Bytes_16;
      Borrador  : out Trabajo;
      Estado    : out Interfaces.Integer_32)
   with
     Global        => null,
     Export,
     Convention    => C,
     External_Name => "winsi_aead_sellar";

   --  void winsi_aead_abrir(const uint8_t clave[32], const uint8_t nonce[12],
   --      const uint8_t aad[256], int32_t largo_aad,
   --      const uint8_t c[1048576], int32_t largo,
   --      const uint8_t etiqueta[16], uint8_t m[1048576],
   --      uint8_t trabajo[1048848], int32_t *estado);
   --
   --  Si la etiqueta no coincide, m queda en ceros.
   procedure Abrir_C
     (Clave     : SPARKNaCl.Bytes_32;
      Nonce     : SPARKNaCl.Bytes_12;
      Aad       : Asociados;
      Largo_Aad : Interfaces.Integer_32;
      C         : Datos;
      Largo     : Interfaces.Integer_32;
      Etiqueta  : SPARKNaCl.Bytes_16;
      M         : out Datos;
      Borrador  : out Trabajo;
      Estado    : out Interfaces.Integer_32)
   with
     Global        => null,
     Export,
     Convention    => C,
     External_Name => "winsi_aead_abrir";

end Sealed_Box;
