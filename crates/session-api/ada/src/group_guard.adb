package body Group_Guard
  with SPARK_Mode
is
   function Decide (E : Event) return Action_Set is
   begin
      if not Is_Attack (E) then
         return None;
      elsif E.Bot_Is_Admin then
         return All_Actions;
      else
         return Notify_Owner;
      end if;
   end Decide;

   function Decide_C
     (Kind : Interfaces.C.int; Flags : Interfaces.C.unsigned)
      return Interfaces.C.unsigned
   is
      use type Interfaces.C.int;
      use type Interfaces.C.unsigned;

      function Bit (Mask : Interfaces.C.unsigned) return Boolean
      is ((Flags and Mask) /= 0);

      E : Event;
   begin
      --  Un `int` de C puede traer cualquier cosa: se mira el rango antes de
      --  convertirlo, y es lo que GNATprove exige para dar la conversión por
      --  segura.
      if Kind < 0 or else Kind > 2 then
         return 0;
      end if;

      E :=
        (Kind             => Event_Kind'Val (Kind),
         Guard_On         => Bit (Flag_Guard_On),
         Author_Known     => Bit (Flag_Author_Known),
         Author_Protected => Bit (Flag_Author_Protected),
         Author_Is_Bot    => Bit (Flag_Author_Is_Bot),
         Author_Is_Target => Bit (Flag_Author_Is_Target),
         Target_Protected => Bit (Flag_Target_Protected),
         Target_Is_Bot    => Bit (Flag_Target_Is_Bot),
         Bot_Is_Admin     => Bit (Flag_Bot_Is_Admin));

      return Interfaces.C.unsigned (Decide (E));
   end Decide_C;

end Group_Guard;
