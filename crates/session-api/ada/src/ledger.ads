--  Mover un monto de un saldo a otro: #pay, #transfer y el banco.
--
--  GNATprove demuestra, para toda entrada, que se conserva el total —origen
--  más destino es lo mismo antes y después—, que ningún saldo queda negativo
--  ni pasa del último entero exacto de JavaScript (2**53 - 1, donde viven los
--  saldos del bot), que si la operación no se puede no cambia nada, y que si
--  se puede se hace por exactamente el monto pedido.
--
--  Pure y sin elaboración, como Group_Guard: el objeto no pide el runtime de
--  Ada y se enlaza dentro de la Session API por la ABI de C.

with Interfaces;

package Ledger
  with SPARK_Mode, Pure
is
   use type Interfaces.Integer_64;
   use type Interfaces.Integer_32;

   --  El último entero exacto de JavaScript (Number.MAX_SAFE_INTEGER).
   Max_Saldo : constant := 2**53 - 1;

   subtype Monto64 is Interfaces.Integer_64;
   subtype Saldo is Monto64 range 0 .. Max_Saldo;

   type Resultado is
     (Hecho,           --  se movió el monto
      Monto_Invalido,  --  menos de 1
      Sin_Saldo,       --  el origen no alcanza
      Desborda,        --  el destino pasaría de Max_Saldo
      Misma_Cuenta,    --  origen y destino son la misma cuenta
      Fuera_De_Rango); --  un saldo de entrada no es un Saldo

   function Se_Puede
     (Origen, Destino : Saldo; Monto : Monto64; Misma : Boolean)
      return Boolean
   is (not Misma
       and then Monto >= 1
       and then Monto <= Origen
       and then Destino <= Max_Saldo - Monto);

   procedure Mover
     (Origen, Destino : in out Saldo;
      Monto           : Monto64;
      Misma           : Boolean;
      R               : out Resultado)
   with
     Post =>
       --  El total se conserva, se haga o no.
       Origen + Destino = Origen'Old + Destino'Old
       --  Se hace exactamente cuando se puede, y por el monto pedido.
       and then (R = Hecho) = Se_Puede (Origen'Old, Destino'Old, Monto, Misma)
       and then (if R = Hecho
                 then Origen = Origen'Old - Monto
                      and then Destino = Destino'Old + Monto
                 else Origen = Origen'Old and then Destino = Destino'Old);

   --  Para la ABI de C:
   --    void winsi_ledger_move(int64_t origen, int64_t destino,
   --                           int64_t monto, int32_t misma,
   --                           int64_t *nuevo_origen,
   --                           int64_t *nuevo_destino, int32_t *codigo);
   --  Los saldos llegan como int64 y pueden traer cualquier cosa: uno fuera de
   --  0 .. Max_Saldo da Fuera_De_Rango y no se mueve nada. El código es la
   --  posición del Resultado (Hecho = 0).
   procedure Mover_C
     (Origen, Destino, Monto : Monto64;
      Misma                  : Interfaces.Integer_32;
      Nuevo_Origen           : out Monto64;
      Nuevo_Destino          : out Monto64;
      Codigo                 : out Interfaces.Integer_32)
   with
     Export,
     Convention    => C,
     External_Name => "winsi_ledger_move",
     Post          =>
       --  Nunca se crea ni se destruye nada. Con saldos válidos, el total se
       --  conserva; con basura de C —donde la suma misma se desbordaría,
       --  como señaló GNATprove en la primera versión de este contrato—, no
       --  se toca nada (la última cláusula).
       (if Origen in Saldo and then Destino in Saldo
        then Nuevo_Origen + Nuevo_Destino = Origen + Destino)
       and then Codigo in 0 .. Resultado'Pos (Resultado'Last)
       and then (Codigo = 0) =
                  (Origen in Saldo and then Destino in Saldo
                   and then Se_Puede (Origen, Destino, Monto, Misma /= 0))
       and then (if Codigo /= 0
                 then Nuevo_Origen = Origen and then Nuevo_Destino = Destino);

   --  Aplicar varios cambios de saldo a la vez, todo o nada: ganar, gastar,
   --  un cofre que da dinero y diamantes. Hasta Max_Cuentas saldos, cada uno
   --  con su cambio (positivo o negativo). Se aplican todos cuando cada
   --  resultado queda en 0 .. Max_Saldo; si uno solo no, no se toca ninguno.
   Max_Cuentas : constant := 8;
   type Arreglo64 is array (1 .. Max_Cuentas) of Monto64
     with Convention => C;

   --  Un cambio no puede ser más grande que un saldo entero: así la suma
   --  nunca se desborda en 64 bits, venga lo que venga de C.
   subtype Cambio is Monto64 range -Max_Saldo .. Max_Saldo;

   function Entrada_Valida (S, D : Arreglo64; N : Interfaces.Integer_32)
      return Boolean
   is (N in 0 .. Max_Cuentas
       and then (for all I in 1 .. Integer (N) =>
                   S (I) in Saldo and then D (I) in Cambio));

   function Todos_En_Rango (S, D : Arreglo64; N : Interfaces.Integer_32)
      return Boolean
   is (for all I in 1 .. Integer (N) => S (I) + D (I) in Saldo)
   with Pre => Entrada_Valida (S, D, N);

   --  Para la ABI de C:
   --    void winsi_ledger_apply(int64_t saldos[8], const int64_t cambios[8],
   --                            int32_t n, int32_t *codigo);
   --  Código: 0 aplicado, 2 algún saldo quedaría negativo, 3 alguno pasaría
   --  de Max_Saldo, 5 entrada inválida (n, un saldo o un cambio fuera de
   --  rango). Los mismos números que Resultado.
   procedure Aplicar_C
     (Saldos  : in out Arreglo64;
      Cambios : Arreglo64;
      N       : Interfaces.Integer_32;
      Codigo  : out Interfaces.Integer_32)
   with
     Export,
     Convention    => C,
     External_Name => "winsi_ledger_apply",
     Post          =>
       (Codigo = 0) =
         (Entrada_Valida (Saldos'Old, Cambios, N)
          and then Todos_En_Rango (Saldos'Old, Cambios, N))
       and then
       (if Codigo = 0
        then (for all I in 1 .. Max_Cuentas =>
                (if I <= Integer (N)
                 then Saldos (I) = Saldos'Old (I) + Cambios (I)
                 else Saldos (I) = Saldos'Old (I)))
        else Saldos = Saldos'Old)
       and then Codigo in 0 | 2 | 3 | 5;

end Ledger;
