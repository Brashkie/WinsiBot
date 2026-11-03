--  SipHash-2-4 (Aumasson y Bernstein, 2012): una función con clave de 128
--  bits que convierte un texto corto en 64 bits. Sin la clave no se puede
--  calcular ni invertir; es para lo que se diseñó: textos cortos, como un
--  JID. La base de la IA guarda así a cada persona, como un seudónimo, y no
--  con su número (ver src/privacy.rs).
--
--  No es criptografía inventada: es el algoritmo publicado, y los tests lo
--  comparan con la implementación de referencia de Rust (std::hash::SipHasher,
--  que es SipHash-2-4) y con el vector oficial del paper.
--
--  GNATprove demuestra que no hay errores de ejecución para ninguna entrada:
--  nunca lee fuera del mensaje ni del arreglo, y la aritmética es módulo 2**64
--  por definición, como pide el algoritmo.
--
--  Pure y sin elaboración, como los demás: se enlaza por la ABI de C.

with Interfaces;

package Sip_Hash
  with SPARK_Mode, Pure
is
   use type Interfaces.Integer_32;

   subtype U64 is Interfaces.Unsigned_64;
   subtype Byte is Interfaces.Unsigned_8;

   Max_Mensaje : constant := 256;
   type Mensaje is array (1 .. Max_Mensaje) of Byte
     with Convention => C;

   --  uint64_t winsi_siphash24(uint64_t k0, uint64_t k1,
   --                           const uint8_t mensaje[256], int32_t largo);
   --
   --  `largo` fuera de 0 .. 256 cuenta como 0.
   function Sip_2_4_C
     (K0, K1 : U64;
      M      : Mensaje;
      Largo  : Interfaces.Integer_32) return U64
   with
     Export,
     Convention    => C,
     External_Name => "winsi_siphash24";

end Sip_Hash;
