package body Send_Pacing
  with SPARK_Mode
is
   procedure Permiso_C (P : Pedido; H : Historial; R : out Respuesta) is
      Ahora : constant Ms := Acotar (P.Ahora);
      T     : Ms := Ahora;
      M     : I32 := M_Libre;

      --  Como `empujar` en Rust: la regla se queda como motivo solo si corre
      --  el turno estrictamente hacia adelante.
      procedure Empujar (Cota : Ms; Motivo : I32)
      with
        Post => T = I64'Max (T'Old, Cota)
                and then (if Cota > T'Old then M = Motivo else M = M'Old)
      is
      begin
         if Cota > T then
            T := Cota;
            M := Motivo;
         end if;
      end Empujar;
   begin
      R := (Turno => 0, Espera => 0, Codigo => 1, Motivo => M_Contacto);
      if Contacto_En_Espera (P) then
         R.Espera := Acotar (P.Contacto_Hasta) - Ahora;
         return;
      end if;

      Empujar (Acotar (P.Enfriado_Hasta), M_Enfriamiento);
      Empujar (Cota_Pausa (P, H), M_Pausa);
      Empujar (Cota_Ventana (P, H, P.Por_Minuto, Minuto), M_Minuto);
      Empujar (Cota_Ventana (P, H, P.Por_Hora, Hora), M_Hora);
      pragma Assert (T = T_Hora (P, H));
      Empujar
        (Cota_Dia (P, H),
         (if En_Calentamiento (P, T) then M_Calentamiento else M_Dia));
      pragma Assert (T = Turno (P, H));

      R.Motivo := M;
      R.Espera := T - Ahora;
      if T - Ahora <= Acotar (P.Espera_Max) then
         R.Turno := T;
         R.Codigo := 0;
      end if;
   end Permiso_C;

   function Escalada (Base : I64; Nivel : I32; Techo : I64) return I64 is
      B : constant Ms := Acotar (Base);
      C : constant Ms := Acotar (Techo);
      K : constant I64 := Potencia (Nivel);
   begin
      --  Base * K podría pasar de 64 bits con una base absurda: se compara
      --  contra Techo / K, que nunca desborda.
      if B <= C / K then
         pragma Assert (C / K * K <= C);
         pragma Assert (B * K <= C / K * K);
         return B * K;
      else
         return C;
      end if;
   end Escalada;
end Send_Pacing;
