with SPARKNaCl.Core;
with SPARKNaCl.MAC;
with SPARKNaCl.Stream;

package body Sealed_Box
  with SPARK_Mode
is
   use type SPARKNaCl.Byte;
   use type SPARKNaCl.U64;

   subtype Largo_Aad_T is SPARKNaCl.N32 range 1 .. Max_Aad;
   subtype Largo_Datos_T is SPARKNaCl.N32 range 1 .. Max_Datos;

   --  `N` redondeado hacia arriba a un múltiplo de 16.
   function A_16 (N : SPARKNaCl.N32) return SPARKNaCl.N32
   is ((N + 15) / 16 * 16)
   with Pre  => N <= Max_Datos,
        Post => A_16'Result >= N and then A_16'Result <= N + 15
                and then A_16'Result mod 16 = 0;

   --  Lo que autentica Poly1305 (RFC 8439 §2.8): los datos asociados y el
   --  cifrado, cada uno rellenado con ceros a 16, y sus largos en 8 bytes
   --  little endian.
   procedure Armar
     (T     : out Trabajo;
      Aad   : Asociados;
      LA    : Largo_Aad_T;
      C     : Datos;
      LC    : Largo_Datos_T;
      Largo : out SPARKNaCl.N32)
   with
     Global => null,
     Post   => Largo >= 16 and then Largo <= Max_Trabajo
   is
      PA  : constant SPARKNaCl.N32 := A_16 (LA);
      PC  : constant SPARKNaCl.N32 := A_16 (LC);
      Pos : constant SPARKNaCl.N32 := PA + PC;

      procedure Poner_LE64 (Desde : SPARKNaCl.N32; V : SPARKNaCl.U64)
      with
        Global => (In_Out => T),
        Pre    => Desde <= Max_Trabajo - 8
      is
         X : SPARKNaCl.U64 := V;
      begin
         for I in SPARKNaCl.N32 range 0 .. 7 loop
            T (Desde + I) := SPARKNaCl.Byte (X mod 256);
            X := X / 256;
         end loop;
      end Poner_LE64;
   begin
      T := (others => 0);
      T (0 .. LA - 1) := Aad (0 .. LA - 1);
      T (PA .. PA + LC - 1) := C (0 .. LC - 1);
      Poner_LE64 (Pos, SPARKNaCl.U64 (LA));
      Poner_LE64 (Pos + 8, SPARKNaCl.U64 (LC));
      Largo := Pos + 16;
   end Armar;

   --  La etiqueta de Poly1305 con la clave de un solo uso del bloque 0.
   procedure Etiquetar
     (K      : SPARKNaCl.Core.ChaCha20_Key;
      Nonce  : SPARKNaCl.Bytes_12;
      Aad    : Asociados;
      LA     : Largo_Aad_T;
      C      : Datos;
      LC     : Largo_Datos_T;
      T      : out Trabajo;
      Salida : out SPARKNaCl.Bytes_16)
   with Global => null
   is
      Otk_Bytes : SPARKNaCl.Bytes_32;
      Otk       : SPARKNaCl.MAC.Poly_1305_Key;
      Largo     : SPARKNaCl.N32;
   begin
      SPARKNaCl.Stream.ChaCha20_IETF (Otk_Bytes, Nonce, K, 0);
      SPARKNaCl.MAC.Construct (Otk, Otk_Bytes);
      Armar (T, Aad, LA, C, LC, Largo);
      SPARKNaCl.MAC.Onetimeauth (Salida, T (0 .. Largo - 1), Otk);
      --  Borrar la clave de un solo uso: que no quede para quien lea la
      --  memoria después. Para el análisis de flujo "no tiene efecto" porque
      --  nadie la lee; es justamente lo que se busca.
      pragma Warnings (GNATprove, Off, "statement has no effect",
                       Reason => "se borra la clave a propósito");
      pragma Warnings (GNATprove, Off, """Otk*"" is set by ""Sanitize""*",
                       Reason => "se borra la clave a propósito");
      SPARKNaCl.Sanitize (Otk_Bytes);
      SPARKNaCl.MAC.Sanitize (Otk);
      pragma Warnings (GNATprove, On, "statement has no effect");
      pragma Warnings (GNATprove, On, """Otk*"" is set by ""Sanitize""*");
   end Etiquetar;

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
   is
      K : SPARKNaCl.Core.ChaCha20_Key;
   begin
      C := (others => 0);
      Etiqueta := (others => 0);
      Borrador := (others => 0);
      if Largo_Aad < 1 or else Largo_Aad > Max_Aad
        or else Largo < 1 or else Largo > Max_Datos
      then
         Estado := Fuera_Rango;
         return;
      end if;

      declare
         LM : constant Largo_Datos_T := SPARKNaCl.N32 (Largo);
         LA : constant Largo_Aad_T := SPARKNaCl.N32 (Largo_Aad);
      begin
         SPARKNaCl.Core.Construct (K, Clave);
         SPARKNaCl.Stream.ChaCha20_IETF_Xor
           (C       => C (0 .. LM - 1),
            M       => M (0 .. LM - 1),
            N       => Nonce,
            K       => K,
            Counter => 1);
         Etiquetar (K, Nonce, Aad, LA, C, LM, Borrador, Etiqueta);
         pragma Warnings (GNATprove, Off, "statement has no effect",
                          Reason => "se borra la clave a propósito");
         pragma Warnings (GNATprove, Off, """K"" is set by ""Sanitize""*",
                          Reason => "se borra la clave a propósito");
         SPARKNaCl.Core.Sanitize (K);
         pragma Warnings (GNATprove, On, "statement has no effect");
         pragma Warnings (GNATprove, On, """K"" is set by ""Sanitize""*");
      end;
      Estado := Bien;
   end Sellar_C;

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
   is
      K         : SPARKNaCl.Core.ChaCha20_Key;
      Esperada  : SPARKNaCl.Bytes_16;
      Distinto  : SPARKNaCl.Byte := 0;
   begin
      M := (others => 0);
      Borrador := (others => 0);
      if Largo_Aad < 1 or else Largo_Aad > Max_Aad
        or else Largo < 1 or else Largo > Max_Datos
      then
         Estado := Fuera_Rango;
         return;
      end if;

      declare
         LC : constant Largo_Datos_T := SPARKNaCl.N32 (Largo);
         LA : constant Largo_Aad_T := SPARKNaCl.N32 (Largo_Aad);
      begin
         SPARKNaCl.Core.Construct (K, Clave);
         Etiquetar (K, Nonce, Aad, LA, C, LC, Borrador, Esperada);

         --  En tiempo constante: se recorren los 16 bytes siempre.
         for I in Esperada'Range loop
            Distinto := Distinto or (Esperada (I) xor Etiqueta (I));
         end loop;

         if Distinto = 0 then
            SPARKNaCl.Stream.ChaCha20_IETF_Xor
              (C       => M (0 .. LC - 1),
               M       => C (0 .. LC - 1),
               N       => Nonce,
               K       => K,
               Counter => 1);
         end if;
         pragma Warnings (GNATprove, Off, "statement has no effect",
                          Reason => "se borra la clave a propósito");
         pragma Warnings (GNATprove, Off, """K"" is set by ""Sanitize""*",
                          Reason => "se borra la clave a propósito");
         SPARKNaCl.Core.Sanitize (K);
         pragma Warnings (GNATprove, On, "statement has no effect");
         pragma Warnings (GNATprove, On, """K"" is set by ""Sanitize""*");
      end;

      Estado := (if Distinto = 0 then Bien else No_Coincide);
   end Abrir_C;

end Sealed_Box;
