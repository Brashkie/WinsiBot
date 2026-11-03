package body Phone_Guard
  with SPARK_Mode
is
   use Interfaces;

   procedure Buscar_C
     (T     : Texto;
      Largo : Integer_32;
      Desde : Integer_32;
      Ini   : out Integer_32;
      Fin   : out Integer_32;
      Res   : out Integer_32)
   is
      L : Natural;
      I : Positive;
   begin
      Ini := 0;
      Fin := 0;
      Res := 0;
      if Largo not in 0 .. Max_Texto or else Desde not in 1 .. Largo + 1 then
         Res := -1;
         return;
      end if;
      L := Natural (Largo);
      I := Positive (Desde);

      while I <= L loop
         pragma Loop_Invariant (I >= Positive (Desde) and then I <= L);
         pragma Loop_Variant (Increases => I);

         --  Un número empieza en un dígito que no sigue a una letra ni a
         --  otro dígito: "abc123456" no es un teléfono.
         if Es_Digito (T (I))
           and then (I = 1 or else not Es_Alnum (T (I - 1)))
         then
            declare
               J : Positive := I + 1;
               F : Positive := I;      --  el último dígito
               D : Positive := 1;      --  cuántos dígitos
            begin
               --  Dígitos y, entre ellos, hasta dos separadores seguidos:
               --  "+51 924-360-740", "(51) 924 360 740".
               while J <= L loop
                  pragma Loop_Invariant
                    (J in I + 1 .. L
                     and then F in I .. J - 1
                     and then Es_Digito (T (F))
                     and then D <= F - I + 1
                     and then (for all K in I .. J - 1 => Es_Parte (T (K))));
                  pragma Loop_Variant (Increases => J);

                  if Es_Digito (T (J)) then
                     D := D + 1;
                     F := J;
                  elsif Es_Sep (T (J))
                    and then ((J + 1 <= L and then Es_Digito (T (J + 1)))
                              or else (J + 2 <= L
                                       and then Es_Sep (T (J + 1))
                                       and then Es_Digito (T (J + 2))))
                  then
                     null;
                  else
                     exit;
                  end if;
                  J := J + 1;
               end loop;

               if D in Min_Digitos .. Max_Digitos
                 and then (F = L or else not Es_Alnum (T (F + 1)))
               then
                  --  El '+' de adelante también se tapa, si está en el
                  --  tramo pedido.
                  if I > Positive (Desde) and then T (I - 1) = Mas then
                     Ini := Integer_32 (I - 1);
                  else
                     Ini := Integer_32 (I);
                  end if;
                  Fin := Integer_32 (F);
                  Res := Integer_32 (D);
                  return;
               end if;

               --  No es un número (muy corto, muy largo o pegado a una
               --  letra): se salta entero.
               I := F + 1;
            end;
         else
            I := I + 1;
         end if;
      end loop;
   end Buscar_C;

   procedure Enmascarar_C
     (D   : Digitos;
      N   : Integer_32;
      Sal : out Salida;
      Res : out Integer_32)
   is
   begin
      Sal := (others => 0);
      Res := -1;
      if N not in Min_Digitos .. Max_Digitos
        or else not Todos_Digitos (D, Natural (N))
      then
         return;
      end if;

      declare
         M   : constant Natural := Natural (N);
         Len : constant Natural := Largo_Mascara (M);
      begin
         Sal (1) := D (1);
         Sal (2) := D (2);
         --  Un "•" por cada dígito del medio.
         for K in 3 .. M - 3 loop
            Sal (3 + 3 * (K - 3)) := P1;
            Sal (4 + 3 * (K - 3)) := P2;
            Sal (5 + 3 * (K - 3)) := P3;
            pragma Loop_Invariant
              (Sal (1) = D (1) and then Sal (2) = D (2)
               and then (for all P in 3 .. 5 + 3 * (K - 3) =>
                           (case (P - 3) mod 3 is
                               when 0      => Sal (P) = P1,
                               when 1      => Sal (P) = P2,
                               when others => Sal (P) = P3)));
         end loop;
         --  Los tres últimos.
         for K in 1 .. 3 loop
            Sal (Len - 3 + K) := D (M - 3 + K);
            pragma Loop_Invariant
              (Sal (1) = D (1) and then Sal (2) = D (2)
               and then (for all P in 3 .. Len - 3 =>
                           (case (P - 3) mod 3 is
                               when 0      => Sal (P) = P1,
                               when 1      => Sal (P) = P2,
                               when others => Sal (P) = P3))
               and then (for all Q in 1 .. K =>
                           Sal (Len - 3 + Q) = D (M - 3 + Q)));
         end loop;
         Res := Integer_32 (Len);
      end;
   end Enmascarar_C;

   --  Si T (Desde .. Hasta) es exactamente S.
   function Igual
     (T : Texto_Jid; Desde, Hasta : Natural; S : String) return Boolean
   is (Hasta >= Desde
       and then Hasta - Desde + 1 = S'Length
       and then (for all Q in 0 .. S'Length - 1 =>
                   T (Desde + Q) = Byte (Character'Pos (S (S'First + Q)))))
   with Pre => Desde >= 1 and then Hasta <= Max_Jid
               and then S'Length >= 1 and then S'Last < Positive'Last;

   procedure Leer_Jid_C
     (T     : Texto_Jid;
      Largo : Integer_32;
      Fin   : out Integer_32;
      Res   : out Integer_32)
   is
      L : Natural;
      K : Natural := 0;
      A : Positive;
   begin
      Fin := 0;
      Res := 0;
      if Largo not in 1 .. Max_Jid then
         return;
      end if;
      L := Natural (Largo);

      --  El número: de 1 a 20 dígitos desde el principio.
      while K < L and then K < Max_Digitos and then Es_Digito (T (K + 1))
      loop
         K := K + 1;
         pragma Loop_Invariant
           (K in 1 .. Max_Digitos and then K <= L
            and then (for all Q in 1 .. K => Es_Digito (T (Q))));
         pragma Loop_Variant (Increases => K);
      end loop;
      if K = 0 or else K >= L or else T (K + 1) not in 58 | 64 then
         return;
      end if;

      --  El dispositivo, si lo hay (":12"), y la arroba.
      A := K + 1;
      if T (A) = 58 then
         A := A + 1;
         while A <= L and then Es_Digito (T (A)) loop
            pragma Loop_Invariant (A in K + 2 .. L);
            pragma Loop_Variant (Increases => A);
            A := A + 1;
         end loop;
         if A > L or else T (A) /= 64 then
            return;
         end if;
      end if;

      if Igual (T, A + 1, L, "s.whatsapp.net")
        or else Igual (T, A + 1, L, "c.us")
      then
         Res := 1;
      elsif Igual (T, A + 1, L, "lid") then
         Res := 2;
      elsif Igual (T, A + 1, L, "g.us") then
         Res := 3;
      elsif A < L then
         Res := 4;
      else
         return;
      end if;
      Fin := Integer_32 (K);
   end Leer_Jid_C;
end Phone_Guard;
