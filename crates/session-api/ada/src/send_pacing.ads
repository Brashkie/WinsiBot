--  El ritmo de salida de cada cuenta (antiban): cuándo sale el próximo envío.
--
--  El historial, los contactos en espera y el archivo siguen en Rust
--  (src/antiban.rs). Lo que está aquí es la decisión: dado el historial de
--  envíos de las últimas 24 h, la pausa sorteada y la política, en qué
--  instante sale este envío, o si se rechaza. GNATprove demuestra, para toda
--  entrada:
--
--  * que el turno nunca rompe un tope: el envío número Tope contando desde el
--    más reciente queda fuera de la ventana —a lo sumo Tope - 1 envíos en
--    el último minuto, la última hora y las últimas 24 h, contando este—;
--  * que respeta el enfriamiento y la pausa, y que nunca sale antes que el
--    último envío (el historial sigue en orden);
--  * que no espera de más: el turno es el primer instante que cumple todo, y
--    el motivo dice cuál de las reglas lo puso ahí;
--  * que se rechaza exactamente cuando el turno queda más lejos que la
--    espera máxima, o cuando el contacto está en espera por un 463;
--  * y que la escalada de las esperas del 429 y del 463 nunca se desborda.
--
--  Pure y sin elaboración, como Ledger: se enlaza por la ABI de C.

with Interfaces;

package Send_Pacing
  with SPARK_Mode, Pure
is
   use type Interfaces.Integer_64;
   use type Interfaces.Integer_32;

   subtype I64 is Interfaces.Integer_64;
   subtype I32 is Interfaces.Integer_32;

   --  Los instantes y las esperas, en ms. 2**61 son 73 millones de años: dos
   --  sumados nunca desbordan 64 bits.
   Max_Ms : constant := 2**61;
   subtype Ms is I64 range 0 .. Max_Ms;

   Minuto : constant := 60_000;
   Hora   : constant := 60 * Minuto;
   Dia    : constant := 24 * Hora;

   --  Los envíos de 24 h que se miran como mucho. Un tope mayor se lee como
   --  este (ver Politica::desde_entorno en Rust).
   Max_Historial : constant := 65_536;
   type Historial is array (0 .. Max_Historial - 1) of I64
     with Convention => C;

   --  Días de calentamiento como mucho, y el tope de cada uno.
   Max_Dias : constant := 64;
   type Topes is array (0 .. Max_Dias - 1) of I64
     with Convention => C;

   --  Lo que manda Rust. Nada se valida con un código de error: todo valor
   --  fuera de rango se lleva al borde más cercano, así la decisión está
   --  definida para cualquier cosa que llegue de C.
   type Pedido is record
      Ahora          : I64;
      Contacto_Hasta : I64;  --  el contacto está en espera (463) hasta acá
      Enfriado_Hasta : I64;  --  la cuenta está enfriada (429) hasta acá
      Pausa          : I64;  --  la pausa sorteada para este envío
      Espera_Max     : I64;
      Por_Minuto     : I64;  --  0 es sin tope
      Por_Hora       : I64;
      Por_Dia        : I64;
      Emparejado     : I64;  --  cuándo se vinculó; negativo es madura
      Calentamiento  : Topes;
      Dias           : I32;  --  cuántos de Calentamiento valen
      Largo          : I32;  --  cuántos envíos tiene el historial
   end record
     with Convention => C;

   type Respuesta is record
      Turno  : I64;  --  cuándo sale (0 si se rechaza)
      Espera : I64;  --  cuánto falta para el turno, o para reintentar
      Codigo : I32;  --  0 enviar, 1 rechazar
      Motivo : I32;  --  la posición de Motivo
   end record
     with Convention => C;

   --  En el orden del Motivo de Rust.
   M_Libre         : constant := 0;
   M_Pausa         : constant := 1;
   M_Minuto        : constant := 2;
   M_Hora          : constant := 3;
   M_Dia           : constant := 4;
   M_Calentamiento : constant := 5;
   M_Enfriamiento  : constant := 6;
   M_Contacto      : constant := 7;

   --  ── La regla, escrita como funciones ────────────────────────────────

   function Acotar (X : I64) return Ms
   is (if X < 0 then 0 elsif X > Max_Ms then Max_Ms else X);

   function Tope (X : I64) return I64
   is (if X < 0 then 0 elsif X > Max_Historial then Max_Historial else X)
   with Post => Tope'Result in 0 .. Max_Historial;

   function Largo (P : Pedido) return Natural
   is (if P.Largo < 0 then 0
       elsif P.Largo > Max_Historial then Max_Historial
       else Natural (P.Largo))
   with Post => Largo'Result <= Max_Historial;

   function Dias (P : Pedido) return Natural
   is (if P.Dias < 0 then 0
       elsif P.Dias > Max_Dias then Max_Dias
       else Natural (P.Dias))
   with Post => Dias'Result <= Max_Dias;

   function Sumar (A, B : Ms) return Ms
   is (if A + B > Max_Ms then Max_Ms else A + B);

   function Envio (P : Pedido; H : Historial; I : Natural) return Ms
   is (Acotar (H (I)))
   with Pre => I < Largo (P);

   --  El último envío más la pausa.
   function Cota_Pausa (P : Pedido; H : Historial) return Ms
   is (if Largo (P) = 0 then 0
       else Sumar (Envio (P, H, Largo (P) - 1), Acotar (P.Pausa)));

   --  Con tope T en una ventana V: si hay T envíos o más, el T-ésimo desde
   --  el más reciente tiene que haber salido de la ventana.
   function Lleno (P : Pedido; T : I64) return Boolean
   is (Tope (T) > 0 and then Largo (P) >= Natural (Tope (T)));

   function Cota_Ventana (P : Pedido; H : Historial; T : I64; V : Ms)
      return Ms
   is (if Lleno (P, T)
       then Sumar (Envio (P, H, Largo (P) - Natural (Tope (T))), V)
       else 0);

   --  El día de calentamiento en el instante T, si hay uno.
   function Dia_De (P : Pedido; T : Ms) return I64
   is (if T > Acotar (P.Emparejado) then (T - Acotar (P.Emparejado)) / Dia
       else 0)
   with Pre => P.Emparejado >= 0;

   function En_Calentamiento (P : Pedido; T : Ms) return Boolean
   is (P.Emparejado >= 0 and then Dia_De (P, T) < I64 (Dias (P)));

   function Tope_Dia (P : Pedido; T : Ms) return I64
   is (if En_Calentamiento (P, T)
       then Tope (P.Calentamiento (Natural (Dia_De (P, T))))
       else Tope (P.Por_Dia));

   --  Cada regla empuja el turno hacia adelante, en este orden; el tope del
   --  día se mira en el instante al que llegaron las anteriores.
   function T_Enfriado (P : Pedido) return Ms
   is (I64'Max (Acotar (P.Ahora), Acotar (P.Enfriado_Hasta)));

   function T_Pausa (P : Pedido; H : Historial) return Ms
   is (I64'Max (T_Enfriado (P), Cota_Pausa (P, H)));

   function T_Minuto (P : Pedido; H : Historial) return Ms
   is (I64'Max (T_Pausa (P, H), Cota_Ventana (P, H, P.Por_Minuto, Minuto)));

   function T_Hora (P : Pedido; H : Historial) return Ms
   is (I64'Max (T_Minuto (P, H), Cota_Ventana (P, H, P.Por_Hora, Hora)));

   function Cota_Dia (P : Pedido; H : Historial) return Ms
   is (Cota_Ventana (P, H, Tope_Dia (P, T_Hora (P, H)), Dia));

   function Turno (P : Pedido; H : Historial) return Ms
   is (I64'Max (T_Hora (P, H), Cota_Dia (P, H)));

   function Contacto_En_Espera (P : Pedido) return Boolean
   is (Acotar (P.Contacto_Hasta) > Acotar (P.Ahora));

   function Se_Envia (P : Pedido; H : Historial) return Boolean
   is (not Contacto_En_Espera (P)
       and then Turno (P, H) - Acotar (P.Ahora) <= Acotar (P.Espera_Max));

   --  Para la ABI de C:
   --    void winsi_pacing_permit(const struct pedido *p,
   --                             const int64_t *historial,
   --                             struct respuesta *r);
   --  El historial tiene al menos Largo envíos, del más viejo al más nuevo;
   --  solo se leen el último y los T-ésimos desde el final, todos < Largo.
   procedure Permiso_C (P : Pedido; H : Historial; R : out Respuesta)
   with
     Export,
     Convention    => C,
     External_Name => "winsi_pacing_permit",
     Post          =>
       R.Codigo in 0 .. 1
       and then R.Motivo in M_Libre .. M_Contacto
       and then (R.Codigo = 0) = Se_Envia (P, H)
       --  El contacto en espera manda: no se reserva nada.
       and then
       (if Contacto_En_Espera (P)
        then R.Motivo = M_Contacto
             and then R.Espera = Acotar (P.Contacto_Hasta) - Acotar (P.Ahora)
             and then R.Turno = 0
        else
          --  Si se envía, en el turno; si no, se reintenta cuando llegaría.
          R.Espera = Turno (P, H) - Acotar (P.Ahora)
          and then R.Turno = (if R.Codigo = 0 then Turno (P, H) else 0)
          --  Ningún tope se rompe y nada sale antes de tiempo.
          and then Turno (P, H) >= Acotar (P.Ahora)
          and then Turno (P, H) >= Acotar (P.Enfriado_Hasta)
          and then Turno (P, H) >= Cota_Pausa (P, H)
          and then (if Largo (P) > 0
                    then Turno (P, H) >= Envio (P, H, Largo (P) - 1))
          and then
          (if Lleno (P, P.Por_Minuto)
           then Turno (P, H) >=
                  Sumar
                    (Envio (P, H, Largo (P) - Natural (Tope (P.Por_Minuto))),
                     Minuto))
          and then
          (if Lleno (P, P.Por_Hora)
           then Turno (P, H) >=
                  Sumar (Envio (P, H, Largo (P) - Natural (Tope (P.Por_Hora))),
                         Hora))
          and then Turno (P, H) >= Cota_Dia (P, H)
          --  Y no espera de más: el motivo es la regla que lo dejó ahí.
          and then (R.Motivo = M_Libre) = (Turno (P, H) = Acotar (P.Ahora))
          and then (if R.Motivo = M_Enfriamiento
                    then Turno (P, H) = Acotar (P.Enfriado_Hasta))
          and then (if R.Motivo = M_Pausa
                    then Turno (P, H) = Cota_Pausa (P, H))
          and then (if R.Motivo = M_Minuto
                    then Turno (P, H) =
                           Cota_Ventana (P, H, P.Por_Minuto, Minuto))
          and then (if R.Motivo = M_Hora
                    then Turno (P, H) = Cota_Ventana (P, H, P.Por_Hora, Hora))
          and then (if R.Motivo in M_Dia | M_Calentamiento
                    then Turno (P, H) = Cota_Dia (P, H)
                         and then (R.Motivo = M_Calentamiento) =
                                    En_Calentamiento (P, T_Hora (P, H)))
          and then R.Motivo /= M_Contacto);

   --  La espera del N-ésimo error seguido: Base, duplicada en cada uno —diez
   --  veces como mucho—, con techo. Para el 429 de la cuenta y el 463 de un
   --  contacto.
   --    int64_t winsi_pacing_backoff(int64_t base, int32_t nivel,
   --                                 int64_t techo);
   type Dobles is array (0 .. 10) of I64;
   Doble : constant Dobles := (1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024);

   function Potencia (N : I32) return I64
   is (Doble (Natural (I32'Min (10, I32'Max (1, N) - 1))))
   with Post => Potencia'Result in 1 .. 1024;

   function Escalada (Base : I64; Nivel : I32; Techo : I64) return I64
   with
     Export,
     Convention    => C,
     External_Name => "winsi_pacing_backoff",
     Post          =>
       Escalada'Result in 0 .. Acotar (Techo)
       and then
       (if Acotar (Base) <= Acotar (Techo) / Potencia (Nivel)
        then Escalada'Result = Acotar (Base) * Potencia (Nivel)
        else Escalada'Result = Acotar (Techo))
       --  Nunca menos que la primera espera (salvo por el techo).
       and then Escalada'Result >= I64'Min (Acotar (Base), Acotar (Techo));

end Send_Pacing;
