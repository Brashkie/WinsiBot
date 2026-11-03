package body Sip_Hash
  with SPARK_Mode
is
   use Interfaces;

   procedure Ronda (V0, V1, V2, V3 : in out U64)
   with Global => null
   is
   begin
      V0 := V0 + V1;
      V1 := Rotate_Left (V1, 13);
      V1 := V1 xor V0;
      V0 := Rotate_Left (V0, 32);
      V2 := V2 + V3;
      V3 := Rotate_Left (V3, 16);
      V3 := V3 xor V2;
      V0 := V0 + V3;
      V3 := Rotate_Left (V3, 21);
      V3 := V3 xor V0;
      V2 := V2 + V1;
      V1 := Rotate_Left (V1, 17);
      V1 := V1 xor V2;
      V2 := Rotate_Left (V2, 32);
   end Ronda;

   --  Los bytes Desde .. Desde + N - 1 como un número little-endian.
   function Palabra (M : Mensaje; Desde, N : Natural) return U64
   with Pre => N <= 8 and then Desde >= 1
               and then Desde <= Max_Mensaje + 1
               and then Desde - 1 + N <= Max_Mensaje
   is
      R : U64 := 0;
   begin
      for I in 0 .. N - 1 loop
         R := R or Shift_Left (U64 (M (Desde + I)), 8 * I);
      end loop;
      return R;
   end Palabra;

   function Sip_2_4_C
     (K0, K1 : U64;
      M      : Mensaje;
      Largo  : Integer_32) return U64
   is
      L  : constant Natural :=
        (if Largo in 0 .. Max_Mensaje then Natural (Largo) else 0);
      V0 : U64 := K0 xor 16#736f6d6570736575#;
      V1 : U64 := K1 xor 16#646f72616e646f6d#;
      V2 : U64 := K0 xor 16#6c7967656e657261#;
      V3 : U64 := K1 xor 16#7465646279746573#;
      B  : U64;
      Completos : constant Natural := L / 8;
   begin
      --  Los bloques completos de 8 bytes: dos rondas cada uno.
      for I in 0 .. Completos - 1 loop
         B := Palabra (M, 8 * I + 1, 8);
         V3 := V3 xor B;
         Ronda (V0, V1, V2, V3);
         Ronda (V0, V1, V2, V3);
         V0 := V0 xor B;
      end loop;

      --  El último: lo que sobra y el largo en el byte alto.
      B := Palabra (M, 8 * Completos + 1, L mod 8)
           or Shift_Left (U64 (L mod 256), 56);
      V3 := V3 xor B;
      Ronda (V0, V1, V2, V3);
      Ronda (V0, V1, V2, V3);
      V0 := V0 xor B;

      --  El cierre: cuatro rondas.
      V2 := V2 xor 16#ff#;
      for I in 1 .. 4 loop
         Ronda (V0, V1, V2, V3);
      end loop;
      return V0 xor V1 xor V2 xor V3;
   end Sip_2_4_C;
end Sip_Hash;
