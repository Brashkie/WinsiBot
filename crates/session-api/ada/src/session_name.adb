package body Session_Name
  with SPARK_Mode
is
   function Validar_C (T : Texto; Largo : Interfaces.Integer_32)
      return Interfaces.Integer_32
   is
   begin
      if Largo not in 1 .. Max_Largo then
         return 1;
      end if;
      --  Byte por byte; el primero fuera de [A-Za-z0-9_-] ya lo descarta.
      for I in 1 .. Natural (Largo) loop
         if not Es_Permitido (T (I)) then
            return 2;
         end if;
         pragma Loop_Invariant
           (for all J in 1 .. I => Es_Permitido (T (J)));
      end loop;
      if Es_Reservado (T, Natural (Largo)) then
         return 3;
      end if;
      return 0;
   end Validar_C;
end Session_Name;
