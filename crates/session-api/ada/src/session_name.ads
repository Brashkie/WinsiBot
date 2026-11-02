--  El nombre de una sesión, que termina siendo una carpeta del disco:
--  sessions/<nombre>/creds.json. Llega por HTTP, así que es la entrada más
--  peligrosa de la Session API: un nombre mal validado escribe o lee fuera
--  de sessions/.
--
--  Hasta la 9.3 se validaba en Rust con `is_alphanumeric()`, que acepta
--  cualquier letra Unicode —é, cirílico, dígitos de ancho completo— aunque
--  el error dijera "solo a-z, 0-9", y no miraba los nombres que Windows
--  reserva para dispositivos: una sesión `con` o `nul` no es una carpeta.
--
--  GNATprove demuestra, para todo texto, que se acepta EXACTAMENTE esto: de 1
--  a 64 bytes, todos de [A-Za-z0-9_-] (ASCII; nada de puntos ni barras, así
--  que tampoco `..`), y que no sea un nombre reservado de Windows (CON, PRN,
--  AUX, NUL, COM0-COM9, LPT0-LPT9, sin importar mayúsculas).
--
--  Pure y sin elaboración, como los demás: se enlaza por la ABI de C.

with Interfaces;

package Session_Name
  with SPARK_Mode, Pure
is
   use type Interfaces.Integer_32;
   use type Interfaces.Unsigned_8;

   Max_Largo : constant := 64;

   subtype Byte is Interfaces.Unsigned_8;
   type Texto is array (1 .. Max_Largo) of Byte
     with Convention => C;

   --  [A-Za-z0-9_-]
   function Es_Permitido (B : Byte) return Boolean
   is (B in 48 .. 57 | 65 .. 90 | 97 .. 122 | 45 | 95);

   function Es_Digito (B : Byte) return Boolean is (B in 48 .. 57);

   --  La letra en mayúscula, para comparar sin importar mayúsculas.
   function Mayus (B : Byte) return Byte
   is (if B in 97 .. 122 then B - 32 else B);

   function Es (T : Texto; I : Positive; C : Character) return Boolean
   is (Mayus (T (I)) = Character'Pos (C))
   with Pre => I <= Max_Largo;

   --  Si las tres primeras letras son A, B y C, sin importar mayúsculas.
   function Empieza (T : Texto; A, B, C : Character) return Boolean
   is (Es (T, 1, A) and then Es (T, 2, B) and then Es (T, 3, C));

   --  Los nombres que Windows reserva para dispositivos. Con los caracteres
   --  permitidos no puede haber extensión ni espacios, así que son exactos.
   function Es_Reservado (T : Texto; L : Natural) return Boolean
   is ((L = 3
        and then (Empieza (T, 'C', 'O', 'N') or else Empieza (T, 'P', 'R', 'N')
                  or else Empieza (T, 'A', 'U', 'X')
                  or else Empieza (T, 'N', 'U', 'L')))
       or else
       (L = 4
        and then (Empieza (T, 'C', 'O', 'M')
                  or else Empieza (T, 'L', 'P', 'T'))
        and then Es_Digito (T (4))))
   with Pre => L <= Max_Largo;

   function Todos_Permitidos (T : Texto; L : Natural) return Boolean
   is (for all I in 1 .. L => Es_Permitido (T (I)))
   with Pre => L <= Max_Largo;

   function Valido (T : Texto; L : Interfaces.Integer_32) return Boolean
   is (L in 1 .. Max_Largo
       and then Todos_Permitidos (T, Natural (L))
       and then not Es_Reservado (T, Natural (L)));

   --  Para la ABI de C:
   --    int32_t winsi_session_name_check(const uint8_t texto[64],
   --                                     int32_t largo);
   --  0 válido; 1 vacío o de más de 64; 2 un byte fuera de [A-Za-z0-9_-];
   --  3 un nombre reservado de Windows.
   function Validar_C (T : Texto; Largo : Interfaces.Integer_32)
      return Interfaces.Integer_32
   with
     Export,
     Convention    => C,
     External_Name => "winsi_session_name_check",
     Post          =>
       Validar_C'Result in 0 .. 3
       and then (Validar_C'Result = 0) = Valido (T, Largo)
       and then (Validar_C'Result = 1) = (Largo not in 1 .. Max_Largo)
       and then (if Validar_C'Result = 2
                 then not Todos_Permitidos (T, Natural (Largo)))
       and then (if Validar_C'Result = 3
                 then Todos_Permitidos (T, Natural (Largo))
                      and then Es_Reservado (T, Natural (Largo)));

end Session_Name;
