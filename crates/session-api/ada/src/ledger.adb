package body Ledger
  with SPARK_Mode
is
   procedure Mover
     (Origen, Destino : in out Saldo;
      Monto           : Monto64;
      Misma           : Boolean;
      R               : out Resultado) is
   begin
      if Misma then
         R := Misma_Cuenta;
      elsif Monto < 1 then
         R := Monto_Invalido;
      elsif Monto > Origen then
         R := Sin_Saldo;
      elsif Destino > Max_Saldo - Monto then
         R := Desborda;
      else
         Origen := Origen - Monto;
         Destino := Destino + Monto;
         R := Hecho;
      end if;
   end Mover;

   procedure Mover_C
     (Origen, Destino, Monto : Monto64;
      Misma                  : Interfaces.Integer_32;
      Nuevo_Origen           : out Monto64;
      Nuevo_Destino          : out Monto64;
      Codigo                 : out Interfaces.Integer_32)
   is
      O, D : Saldo;
      R    : Resultado;
   begin
      Nuevo_Origen := Origen;
      Nuevo_Destino := Destino;
      if Origen not in Saldo or else Destino not in Saldo then
         Codigo := Resultado'Pos (Fuera_De_Rango);
         return;
      end if;
      O := Origen;
      D := Destino;
      Mover (O, D, Monto, Misma /= 0, R);
      Nuevo_Origen := O;
      Nuevo_Destino := D;
      Codigo := Resultado'Pos (R);
   end Mover_C;

   procedure Aplicar_C
     (Saldos  : in out Arreglo64;
      Cambios : Arreglo64;
      N       : Interfaces.Integer_32;
      Codigo  : out Interfaces.Integer_32)
   is
   begin
      if not Entrada_Valida (Saldos, Cambios, N) then
         Codigo := Resultado'Pos (Fuera_De_Rango);
         return;
      end if;

      --  Primero se revisa todo, sin tocar nada.
      for I in 1 .. Integer (N) loop
         if Saldos (I) + Cambios (I) < 0 then
            Codigo := Resultado'Pos (Sin_Saldo);
            return;
         elsif Saldos (I) + Cambios (I) > Max_Saldo then
            Codigo := Resultado'Pos (Desborda);
            return;
         end if;
         pragma Loop_Invariant
           (for all J in 1 .. I => Saldos (J) + Cambios (J) in Saldo);
      end loop;

      --  Después se aplica.
      for I in 1 .. Integer (N) loop
         Saldos (I) := Saldos (I) + Cambios (I);
         pragma Loop_Invariant
           (for all J in 1 .. Max_Cuentas =>
              (if J <= I
               then Saldos (J) = Saldos'Loop_Entry (J) + Cambios (J)
               else Saldos (J) = Saldos'Loop_Entry (J)));
      end loop;
      Codigo := Resultado'Pos (Hecho);
   end Aplicar_C;

end Ledger;
