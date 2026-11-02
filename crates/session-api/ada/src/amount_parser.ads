--  Leer un monto que escribe alguien: #pay 1.000, #bank 500, #cf cara 2k…
--  Es la regla de montoDe (src/lib/amount.ts), la entrada de toda la
--  economía: lo que diga este lector es lo que se cobra o se paga.
--
--  Un monto es una tira de dígitos, o dígitos con separador de miles —punto,
--  coma, guion bajo o espacio, el mismo en toda la tira y cada tres cifras
--  exactas—, que vale como mucho 2**53 - 1, el último entero exacto de
--  JavaScript. Lo demás no es un monto.
--
--  GNATprove demuestra, para todo texto, que el lector acepta exactamente
--  esa gramática (Es_Monto), que el valor es exactamente el de esos dígitos
--  en base 10 (Valor_Hasta) y que nunca se desborda, ni con 32 nueves.
--
--  Pure y sin elaboración, como Ledger: se enlaza por la ABI de C.

with Interfaces;

package Amount_Parser
  with SPARK_Mode, Pure
is
   use type Interfaces.Integer_64;
   use type Interfaces.Integer_32;
   use type Interfaces.Unsigned_8;

   Max_Monto : constant := 2**53 - 1;

   --  El monto más largo con sentido, "9,007,199,254,740,991", tiene 21
   --  caracteres. Con 32 sobra, y una tira más larga no es un monto.
   Max_Largo : constant := 32;

   subtype Byte is Interfaces.Unsigned_8;
   subtype Monto64 is Interfaces.Integer_64;
   type Texto is array (1 .. Max_Largo) of Byte
     with Convention => C;

   function Es_Digito (B : Byte) return Boolean is (B in 48 .. 57);

   --  . , _ y espacio.
   function Es_Separador (B : Byte) return Boolean is (B in 46 | 44 | 95 | 32);

   --  Un rango D .. H del texto (vacío si H < D).
   function Rango_Valido (D, H : Integer) return Boolean
   is (D in 1 .. Max_Largo + 1 and then H in D - 1 .. Max_Largo);

   function Solo_Digitos (T : Texto; D, H : Integer) return Boolean
   is (for all I in D .. H => Es_Digito (T (I)))
   with Pre => Rango_Valido (D, H);

   --  Con miles: un primer grupo de 1 a 3 cifras y después uno o más grupos
   --  de separador + 3 cifras. El largo es entonces K + 4 * G, con K el largo
   --  del primer grupo (1 .. 3) y G >= 1, así que K = largo mod 4. Los
   --  separadores están en las posiciones D + K, D + K + 4, … y son todos
   --  iguales al primero.
   function Primer_Grupo (D, H : Integer) return Natural
   is ((H - D + 1) mod 4)
   with Pre => Rango_Valido (D, H);

   function Con_Miles (T : Texto; D, H : Integer) return Boolean
   is (H - D + 1 >= 5
       and then Primer_Grupo (D, H) /= 0
       and then Es_Separador (T (D + Primer_Grupo (D, H)))
       and then (for all I in D .. H =>
                   (if I - D >= Primer_Grupo (D, H)
                      and then (I - D - Primer_Grupo (D, H)) mod 4 = 0
                    then T (I) = T (D + Primer_Grupo (D, H))
                    else Es_Digito (T (I)))))
   with Pre => Rango_Valido (D, H);

   function Es_Monto (T : Texto; D, H : Integer) return Boolean
   is (D <= H and then (Solo_Digitos (T, D, H) or else Con_Miles (T, D, H)))
   with Pre => Rango_Valido (D, H);

   --  El valor de los dígitos de D .. I en base 10, saltando los
   --  separadores, que se planta en Max_Monto + 1 apenas se pasa: así se
   --  puede escribir sin desbordar, y "pasarse" es un número más.
   function Valor_Hasta (T : Texto; D, I : Integer) return Monto64
   is (if I < D then 0
       elsif not Es_Digito (T (I)) then Valor_Hasta (T, D, I - 1)
       else Monto64'Min
              (Max_Monto + 1,
               Valor_Hasta (T, D, I - 1) * 10 + Monto64 (T (I) - 48)))
   with
     Pre                => D in 1 .. Max_Largo + 1
                           and then I in D - 1 .. Max_Largo,
     Post               => Valor_Hasta'Result in 0 .. Max_Monto + 1,
     Subprogram_Variant => (Decreases => I);

   --  Para la ABI de C:
   --    void winsi_amount_read(const uint8_t texto[32], int32_t largo,
   --                           int64_t *valor, int32_t *codigo);
   --  El texto llega ya recortado (sin espacios a los lados). Código: 0 es
   --  un monto, 1 no lo es, 2 es un monto pero pasa de Max_Monto. Si el
   --  código no es 0, el valor es 0.
   procedure Leer_C
     (T      : Texto;
      Largo  : Interfaces.Integer_32;
      Valor  : out Monto64;
      Codigo : out Interfaces.Integer_32)
   with
     Export,
     Convention    => C,
     External_Name => "winsi_amount_read",
     Post          =>
       Codigo in 0 .. 2
       and then (Codigo = 1) =
                  (Largo not in 0 .. Max_Largo
                   or else not Es_Monto (T, 1, Integer (Largo)))
       and then (if Codigo /= 1
                 then (Codigo = 0) =
                        (Valor_Hasta (T, 1, Integer (Largo)) <= Max_Monto))
       and then (if Codigo = 0
                 then Valor = Valor_Hasta (T, 1, Integer (Largo))
                      and then Valor in 0 .. Max_Monto
                 else Valor = 0);

end Amount_Parser;
