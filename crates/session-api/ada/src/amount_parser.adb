package body Amount_Parser
  with SPARK_Mode
is
   procedure Leer_C
     (T      : Texto;
      Largo  : Interfaces.Integer_32;
      Valor  : out Monto64;
      Codigo : out Interfaces.Integer_32)
   is
      H : Integer;
      V : Monto64 := 0;
   begin
      Valor := 0;
      if Largo not in 0 .. Max_Largo then
         Codigo := 1;
         return;
      end if;
      H := Integer (Largo);

      --  La gramática se chequea con su propia definición: 32 bytes, y así
      --  no hay una segunda versión que pueda separarse de la regla.
      if not Es_Monto (T, 1, H) then
         Codigo := 1;
         return;
      end if;

      for I in 1 .. H loop
         if Es_Digito (T (I)) then
            V := Monto64'Min (Max_Monto + 1, V * 10 + Monto64 (T (I) - 48));
         end if;
         pragma Loop_Invariant (V = Valor_Hasta (T, 1, I));
      end loop;

      if V > Max_Monto then
         Codigo := 2;
      else
         Valor := V;
         Codigo := 0;
      end if;
   end Leer_C;
end Amount_Parser;
