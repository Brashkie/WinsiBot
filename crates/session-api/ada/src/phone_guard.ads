--  Los números de WhatsApp de la gente: encontrarlos en un texto, taparlos y
--  leerlos de un JID. Es lo que el bot usa antes de enviar cualquier mensaje
--  (ver src/core/egress.ts) y al escribir el log, así que lee bytes que
--  vienen de afuera: un texto de un usuario, una respuesta de la IA, un JID.
--
--  WhatsApp esconde los números en los grupos con LID; el bot sabe a qué
--  número corresponde cada LID. Si lo escribe, rompe esa privacidad. Por eso
--  lo que tapa un número está demostrado y no solo probado.
--
--  GNATprove demuestra, para toda entrada:
--    - Buscar_C nunca lee fuera del texto, termina siempre, y lo que devuelve
--      es un tramo del texto que empieza en un dígito (o un '+' pegado a
--      uno), termina en un dígito, tiene solo dígitos y separadores, y no
--      está pegado a una letra o un dígito de afuera;
--    - Enmascarar_C deja ver SOLO los dos primeros y los tres últimos
--      dígitos: todo lo de en medio son puntos "•" (U+2022, tres bytes en
--      UTF-8), y la salida mide exactamente 5 + 3·(N − 5) bytes;
--    - Leer_Jid_C separa el número de un JID sin leer fuera del texto.
--
--  Pure y sin elaboración, como los demás: se enlaza por la ABI de C.

with Interfaces;

package Phone_Guard
  with SPARK_Mode, Pure
is
   use type Interfaces.Integer_32;
   use type Interfaces.Unsigned_8;

   subtype Byte is Interfaces.Unsigned_8;

   --  Un mensaje de WhatsApp no pasa de 65 536 caracteres: con 1 MiB sobra
   --  aunque cada uno ocupe cuatro bytes.
   Max_Texto : constant := 2 ** 20;
   type Texto is array (1 .. Max_Texto) of Byte
     with Convention => C;

   --  Lo que cuenta como número de teléfono: de 6 a 20 dígitos. Los LID
   --  tienen 14 o 15; los números con código de país, de 8 a 15.
   Min_Digitos : constant := 6;
   Max_Digitos : constant := 20;

   function Es_Digito (B : Byte) return Boolean is (B in 48 .. 57);

   function Es_Alnum (B : Byte) return Boolean
   is (B in 48 .. 57 | 65 .. 90 | 97 .. 122);

   --  Lo que puede ir entre los dígitos de un número escrito a mano:
   --  espacio, guion, punto y paréntesis.
   function Es_Sep (B : Byte) return Boolean
   is (B in 32 | 45 | 46 | 40 | 41);

   function Es_Parte (B : Byte) return Boolean
   is (Es_Digito (B) or else Es_Sep (B));

   Mas : constant Byte := 43;  --  '+'

   --  Un tramo [Ini, Fin] del texto que puede ser un número.
   function Tramo_Valido
     (T : Texto; L : Natural; Ini, Fin : Positive) return Boolean
   is (Ini <= Fin and then Fin <= L
       and then (Es_Digito (T (Ini)) or else T (Ini) = Mas)
       and then Es_Digito (T (Fin))
       and then (for all K in Ini + 1 .. Fin => Es_Parte (T (K)))
       and then (Fin = L or else not Es_Alnum (T (Fin + 1))))
   with Pre => L <= Max_Texto;

   --  void winsi_phone_find(const uint8_t *texto, int32_t largo,
   --                        int32_t desde, int32_t *ini, int32_t *fin,
   --                        int32_t *res);
   --
   --  El primer número desde la posición `desde` (base 1). En `res`, cuántos
   --  dígitos tiene (de 6 a 20), con su tramo en `ini` y `fin`; 0 si no hay
   --  más; -1 si `largo` o `desde` están fuera de rango. Para recorrer el
   --  texto entero: volver a llamar con `desde = fin + 1`.
   procedure Buscar_C
     (T     : Texto;
      Largo : Interfaces.Integer_32;
      Desde : Interfaces.Integer_32;
      Ini   : out Interfaces.Integer_32;
      Fin   : out Interfaces.Integer_32;
      Res   : out Interfaces.Integer_32)
   with
     Export,
     Convention    => C,
     External_Name => "winsi_phone_find",
     Post          =>
       Res in -1 | 0 | Min_Digitos .. Max_Digitos
       and then (Res = -1) =
                  (Largo not in 0 .. Max_Texto
                   or else Desde not in 1 .. Largo + 1)
       and then (if Res > 0
                 then Ini >= Desde and then Ini >= 1
                      and then Tramo_Valido
                                 (T, Natural (Largo),
                                  Positive (Ini), Positive (Fin))
                      and then Res <= Fin - Ini + 1);

   type Digitos is array (1 .. Max_Digitos) of Byte
     with Convention => C;

   Max_Salida : constant := 5 + 3 * (Max_Digitos - 5);
   type Salida is array (1 .. Max_Salida) of Byte
     with Convention => C;

   --  Los tres bytes de "•" en UTF-8.
   P1 : constant Byte := 16#E2#;
   P2 : constant Byte := 16#80#;
   P3 : constant Byte := 16#A2#;

   function Todos_Digitos (D : Digitos; N : Natural) return Boolean
   is (for all K in 1 .. N => Es_Digito (D (K)))
   with Pre => N <= Max_Digitos;

   function Largo_Mascara (N : Natural) return Natural
   is (5 + 3 * (N - 5))
   with Pre => N in Min_Digitos .. Max_Digitos;

   --  void winsi_phone_mask(const uint8_t digitos[20], int32_t n,
   --                        uint8_t salida[50], int32_t *res);
   --
   --  51924360740 → 51••••••740. En `res`, el largo de la salida, o -1 si
   --  `n` no está entre 6 y 20 o algo de `digitos[0..n]` no es un dígito.
   procedure Enmascarar_C
     (D   : Digitos;
      N   : Interfaces.Integer_32;
      Sal : out Salida;
      Res : out Interfaces.Integer_32)
   with
     Export,
     Convention    => C,
     External_Name => "winsi_phone_mask",
     Post          =>
       (if N in Min_Digitos .. Max_Digitos
           and then Todos_Digitos (D, Natural (N))
        then
          Res = Interfaces.Integer_32
                                  (Largo_Mascara (Natural (N)))
          --  Se ven los dos primeros y los tres últimos...
          and then Sal (1) = D (1) and then Sal (2) = D (2)
          and then (for all K in 1 .. 3 =>
                      Sal (Natural (Res) - 3 + K) =
                      D (Natural (N) - 3 + K))
          --  ...y lo de en medio son puntos: ningún dígito más.
          and then (for all P in 3 .. Natural (Res) - 3 =>
                      (case (P - 3) mod 3 is
                          when 0      => Sal (P) = P1,
                          when 1      => Sal (P) = P2,
                          when others => Sal (P) = P3))
        else Res = -1);

   Max_Jid : constant := 128;
   type Texto_Jid is array (1 .. Max_Jid) of Byte
     with Convention => C;

   --  void winsi_phone_jid(const uint8_t jid[128], int32_t largo,
   --                       int32_t *fin, int32_t *res);
   --
   --  En `res`, de qué es un JID, y dónde termina su número en `fin` (el
   --  número empieza en 1):
   --    1 un número (@s.whatsapp.net o @c.us), 2 un LID (@lid),
   --    3 un grupo (@g.us), 4 otro servidor, 0 no es un JID con número.
   --  Acepta el dispositivo: 51924360740:12@s.whatsapp.net.
   procedure Leer_Jid_C
     (T     : Texto_Jid;
      Largo : Interfaces.Integer_32;
      Fin   : out Interfaces.Integer_32;
      Res   : out Interfaces.Integer_32)
   with
     Export,
     Convention    => C,
     External_Name => "winsi_phone_jid",
     Post          =>
       Res in 0 .. 4
       and then (if Res > 0
                 then Largo in 1 .. Max_Jid
                      and then Fin in 1 .. Max_Digitos
                      and then Fin < Largo
                      and then (for all K in 1 .. Fin =>
                                  Es_Digito (T (Positive (K))))
                      and then T (Positive (Fin) + 1) in 58 | 64);
                      --  ':' o '@'

end Phone_Guard;
