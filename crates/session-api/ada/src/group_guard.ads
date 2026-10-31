--  El antirrobo de grupos: qué hacer cuando alguien degrada o saca a un admin.
--
--  Solo la decisión, sin efectos: recibe el evento ya descrito por el bot
--  (quién es el autor, quién el afectado, si el bot es admin) y devuelve qué
--  acciones tomar. Ejecutarlas —degradar, volver a promover, revocar el
--  enlace, avisar al dueño— lo hace el bot con Baileys.
--
--  Está en SPARK para que GNATprove demuestre, para TODA entrada posible, lo
--  que dicen los contratos de Decide: que nunca actúa contra un admin
--  protegido ni contra el bot, que nunca actúa sin un autor identificado, que
--  sin ser admin el bot solo avisa, y que ante un ataque de verdad hace todo
--  lo que puede. Y que no hay errores en tiempo de ejecución. Demostrado, el
--  código se compila sin chequeos (-gnatp): no queda nada que chequear.
--
--  Pure y sin elaboración: el objeto no pide el runtime de Ada y se enlaza
--  tal cual dentro de la Session API, que lo llama por la ABI de C.

with Interfaces.C;

package Group_Guard
  with SPARK_Mode, Pure
is
   --  Las acciones, como bits: es lo que cruza la ABI de C.
   type Action_Set is mod 2**8;

   --  Quitarle el admin al autor, devolverle al afectado su lugar, revocar
   --  el enlace del grupo y avisarle al dueño por privado.
   None           : constant Action_Set := 0;
   Demote_Author  : constant Action_Set := 1;
   Restore_Target : constant Action_Set := 2;
   Revoke_Invite  : constant Action_Set := 4;
   Notify_Owner   : constant Action_Set := 8;

   All_Actions : constant Action_Set :=
     Demote_Author or Restore_Target or Revoke_Invite or Notify_Owner;

   type Event_Kind is (Promote, Demote, Remove);

   --  Author_Known: WhatsApp dijo quién lo hizo. Author_Protected: es el
   --  dueño o alguien que él marcó. Author_Is_Target: se degradó o se fue
   --  solo. Target_Is_Bot: el primer paso de un robo es sacar al bot.
   --  Bot_Is_Admin: después del evento; si no lo es, no puede actuar.
   type Event is record
      Kind             : Event_Kind;
      Guard_On         : Boolean;
      Author_Known     : Boolean;
      Author_Protected : Boolean;
      Author_Is_Bot    : Boolean;
      Author_Is_Target : Boolean;
      Target_Protected : Boolean;
      Target_Is_Bot    : Boolean;
      Bot_Is_Admin     : Boolean;
   end record;

   --  Un ataque: alguien conocido, que no es el dueño ni sus protegidos ni el
   --  bot, le quita el lugar a otro que sí está protegido, o al bot.
   function Is_Attack (E : Event) return Boolean is
     (E.Guard_On
      and then E.Kind /= Promote
      and then E.Author_Known
      and then not E.Author_Protected
      and then not E.Author_Is_Bot
      and then not E.Author_Is_Target
      and then (E.Target_Protected or else E.Target_Is_Bot));

   function Decide (E : Event) return Action_Set
   with
     Post =>
       --  Las garantías, una por una:
       --  nunca contra un protegido ni contra el bot,
       (if E.Author_Protected or else E.Author_Is_Bot
        then Decide'Result = None)
       --  nunca sin saber quién fue, ni si se fue o se degradó solo,
       and then (if not E.Author_Known or else E.Author_Is_Target
                 then Decide'Result = None)
       --  apagado no hace nada, y un ascenso nunca es un robo,
       and then (if not E.Guard_On or else E.Kind = Promote
                 then Decide'Result = None)
       --  sin ser admin, el bot solo puede avisar,
       and then (if not E.Bot_Is_Admin
                 then Decide'Result in None | Notify_Owner)
       --  y nada fuera de las cuatro acciones.
       and then (Decide'Result and not All_Actions) = 0,
     Contract_Cases =>
       --  Y exactamente qué hace en cada caso. GNATprove demuestra además que
       --  los tres casos cubren toda entrada y no se pisan.
       (not Is_Attack (E)                    => Decide'Result = None,
        Is_Attack (E) and then E.Bot_Is_Admin => Decide'Result = All_Actions,
        Is_Attack (E) and then not E.Bot_Is_Admin =>
          Decide'Result = Notify_Owner);

   --  Para la ABI de C. `Kind`: 0 ascenso, 1 degradación, 2 expulsión; otro
   --  valor no es un evento y da 0. `Flags`, un bit por campo de Event, en el
   --  orden en que están declarados: bit 0 Guard_On ... bit 7 Bot_Is_Admin.
   Flag_Guard_On         : constant := 2**0;
   Flag_Author_Known     : constant := 2**1;
   Flag_Author_Protected : constant := 2**2;
   Flag_Author_Is_Bot    : constant := 2**3;
   Flag_Author_Is_Target : constant := 2**4;
   Flag_Target_Protected : constant := 2**5;
   Flag_Target_Is_Bot    : constant := 2**6;
   Flag_Bot_Is_Admin     : constant := 2**7;

   function Decide_C
     (Kind : Interfaces.C.int; Flags : Interfaces.C.unsigned)
      return Interfaces.C.unsigned
   with
     Export,
     Convention    => C,
     External_Name => "winsi_group_guard_decide",
     Post          =>
       Interfaces.C."<="
         (Decide_C'Result, Interfaces.C.unsigned (All_Actions));

end Group_Guard;
