const fs = require('fs')
var pensar = [
    {
      autor: "A Francia",
pensamiento: "Es mejor entender un poco que malinterpretar"
    },
    {
      autor: "Abraham Lincoln",
pensamiento: "Casi todos los hombres son capaces de soportar la adversidad Sin embargo, si quieres probar el verdadero carácter de un hombre, dale poder"
    },
    {
      autor: "Esquilo",
pensamiento: "Cuando la determinación de uno es fuerte y firme, Dios se unirá a sus esfuerzos"
    },
    {
      autor: "Esopo",
pensamiento: "El sufrimiento es una lección"
    },
    {
      autor: "Albert Einstein",
pensamiento: "La ciencia sin religión es patética"
    },
    {
      autor: "Albert Einstein",
pensamiento: "La vida es como una bicicleta, para mantener el equilibrio tenemos que seguir moviéndonos"
    },
    {
      autor: "Albert Einstein",
pensamiento: "La diferencia entre pasado, presente y futuro no es más que una obstinada ilusión"
    },
{
      autor: "Albert Einstein",
      "citas": "Una mesa, una silla, un frutero y un violín; ¿qué más se necesita para ser feliz?"
    },
    {
      autor: "Albert Einstein",
pensamiento: "Ten piedad de los demás, sé duro contigo mismo"
    },
    {
      autor: "Alex Osborn",
pensamiento: "La mejor manera de motivarse es asignarse tareas"
    },
    {
      autor: "Alexander A Bogomoletz",
pensamiento: "No debemos desanimarnos La pasión es el estímulo más fuerte para amar, ser creativo y desear vivir más"
    },
    {
      autor: "Alexander Solzhenitsyn",
pensamiento: "El hombre será feliz mientras elija ser feliz"
    },
    {
      autor: "Ali Javán",
pensamiento: "No espero ser todo para todos Solo quiero ser algo para alguien"
    },
    {
      autor: "Ali bin Abi Talib",
pensamiento: "Cuando el intelecto de un hombre es perfecto, tiene pocas palabras"
    },
    {
      autor: "Ali bin Abi Talib",
pensamiento: "Feliz el hombre que puede ser su propio amo, el auriga de sus pasiones y el capitán del arca de su vida"
    },
    {
      autor: "Ali bin Abi Talib",
pensamiento: "Un amigo honesto vale más que las posesiones heredadas de tus antepasados"
    },
    {
      autor: "Anne M Lindbergh",
pensamiento: "Lo que más cansa en la vida es no ser sincero"
    },
    {
      autor: "Anónimo",
pensamiento: "Ábrete a ti, así es como Dios nos da un camino para probar Nunca pienses que el camino está cerrado"
    },
    {
      autor: "Anónimo",
pensamiento: "La procrastinación es la tumba donde se entierra la oportunidad"
    },
    {
      autor: "Antonie De Saint",
pensamiento: "Amar no es mirarse a los ojos, sino mirar juntos en la misma dirección"
    },
    {
      autor: "Aristóteles",
pensamiento: "Somos lo que hacemos repetidamente Por lo tanto, la excelencia no es un acto, sino un hábito"
    },
    {
      autor: "Arnold Glasow",
pensamiento: "Nunca intentes agradar a tu hijo o hija Tú eres solo uno"
    },
    {
      autor: "Arte Buchwald",
pensamiento: "Si puedes hacer reír a otras personas, obtendrás todo el amor que deseas"
    },
    {
      autor: "Artemus Ward",
pensamiento: "Los problemas llegarán tarde o temprano Si surge un problema, dale la bienvenida lo mejor que puedas Cuanto más amistoso lo saludes, más rápido irá"
    },
    {
      autor: "Ashleigh Brillante",
pensamiento: "No podemos hacer nada para cambiar el pasado Pero cualquier cosa que hagamos puede cambiar el futuro"
    },
    {
      autor: "Agustín",
pensamiento: "La paciencia es amiga de la sabiduría"
    },
    {
      autor: "Ayn Rand",
pensamiento: "Las personas creativas están motivadas por el deseo de salir adelante, no por el deseo de vencer a los demás"
    },
    {
      autor: "B J Habibie",
pensamiento: "Dondequiera que estés siempre sé el mejor y da lo mejor que podamos dar"
    },
{
      autor: "Balzac",
pensamiento: "El odio es como el amor, inflamado por pequeñas cosas"
    },
    {
      autor: "Bárbara Sher",
pensamiento: "No necesariamente tienes que tener éxito la primera vez"
    },
    {
      autor: "Beecher",
pensamiento: "Una hora intensa, mucho mejor y rentable que años de soñar y meditar"
    },
    {
      autor: "Benjamin Disraeli",
pensamiento: "Lo mejor que puedes hacer por otra persona no es compartir tu riqueza, sino ayudarla a tener la suya propia"
    },
    {
      autor: "Bill Clinton",
pensamiento: "No hay garantía de éxito, pero no intentarlo es garantía de fracaso"
    },
    {
      autor: "Bill Cosby",
pensamiento: "No sé cuál es la clave del éxito, pero la clave del fracaso es tratar de hacer felices a todos"
    },
    {
      autor: "Bill Gates",
pensamiento: "El consumidor más insatisfecho es un recurso valioso para el aprendizaje"
    },
    {
      autor: "Bill McCartney",
pensamiento: "No estamos aquí para competir entre nosotros Estamos aquí para complementarnos"
    },
    {
      autor: "Brian Koslow",
pensamiento: "Cuanto más dispuestos estemos a asumir la responsabilidad de nuestras acciones, más credibilidad tendremos"
    },
    {
      autor: "Browning",
pensamiento: "Siempre es bueno perdonar, pero es mejor olvidar un error"
    },
    {
      autor: "Bruce Lee",
pensamiento: "No seas un árbol rígido que se rompe con facilidad Sé un bambú que puede soportar doblarse contra el viento"
    },
    {
      autor: "Buda Gautama",
      "citas": "No llores por el fracaso del amor, porque el hombre dejará todo lo que ama"
    },
    {
      autor: "Madre Teresa",
pensamiento: "Si juzgas a otras personas, no tienes tiempo para amarlas"
    },
    {
      autor: "Madre Teresa",
pensamiento: "Si no hay paz, es porque nos hemos olvidado de que nos necesitamos unos a otros"
    },
    {
      autor: "Bung Hatta",
pensamiento: "Se puede mejorar menos inteligencia con el aprendizaje, la falta de habilidad se puede mejorar con la experiencia, la falta de honestidad es difícil de arreglar"
    },
    {
      autor: "Grabar",
pensamiento: "Muchas personas tienen éxito gracias a las muchas dificultades y penurias que deben enfrentar"
    },
    {
      autor: "Carol Burnet",
pensamiento: "Solo yo puedo cambiar mi vida, nadie puede hacerlo por mí"
    },
    {
      autor: "Charles Darwin",
pensamiento: "No es la especie más fuerte la que sobrevive Ni la especie más inteligente Sino la especie que responde mejor al cambio"
    },
    {
      autor: "Charles R Swindoll",
pensamiento: "La vida es un 10 por ciento lo que te sucede, un 90 por ciento cómo reaccionas ante ello"
    },
    {
      autor: "Ching Hai",
pensamiento: "Mejorarnos a nosotros mismos es mejorar el mundo"
    },
    {
      autor: "Ching Hai",
pensamiento: "No discrimines entre buenos y malos trabajos Los problemas surgen cuando discriminamos y tomamos partido"
    },
    {
      autor: "Ching Hai",
pensamiento: "Debemos trabajar sin ataduras Eso se aplica a todos los trabajos La devoción incondicional es lo mejor"
    },
    {
      autor: "Ching Hai",
pensamiento: "Primero debemos encontrar el poder del amor dentro de nosotros mismos, luego podremos amar verdaderamente a los demás"
    },
{
      autor: "Ching Hai",
pensamiento: "Busca el dinero suficiente para pagar tu vida, de modo que puedas reservar tiempo y energía para la práctica espiritual"
    },
    {
      autor: "Cristóbal Colón",
pensamiento: "La riqueza no enriquece a una persona, solo la hace más ocupada"
    },
    {
      autor: "Cicerón",
pensamiento: "Un corazón agradecido no es solo la mayor virtud, sino la madre de todas las demás virtudes"
    },
    {
      autor: "Cicerón",
pensamiento: "Un corazón agradecido no es solo la mayor virtud, sino la madre de todas las demás virtudes"
    },
    {
      autor: "Clarence Darrow",
pensamiento: "La libertad viene de las personas, no de las leyes o instituciones"
    },
    {
      autor: "Confucio",
pensamiento: "La vida es realmente simple, pero insistimos en complicarla"
    },
    {
      autor: "Confucio",
pensamiento: "Dondequiera que vayas, ve con todo tu corazón"
    },
    {
      autor: "Confucio",
pensamiento: "Las personas que cometen errores y no corrigen sus errores cometen otros errores"
    },
    {
      autor: "Confucio",
pensamiento: "Nuestro mayor orgullo no es no fallar nunca, sino levantarnos cada vez que nos caemos"
    },
    {
      autor: "Cobre",
pensamiento: "La flor que nunca se marchitará en la tierra es una virtud"
    },
    {
      autor: "Cynthia Ozick",
pensamiento: "Imaginar lo inimaginable requiere una imaginación extraordinaria"
    },
    {
      autor: "D J Schwartz",
pensamiento: "Cualquier dificultad no resiste la tenacidad y la perseverancia Sin tenacidad, las personas más inteligentes y talentosas a menudo fracasan en la vida"
    },
    {
      autor: "Dale Carnegie",
pensamiento: "La única forma en que podemos obtener amor, no es exigir que nos amen, sino comenzar a dar amor a los demás sin esperar nada a cambio"
    },
    {
      autor: "Dale Carnegie",
pensamiento: "Cuando las personas que se preocupan por sus defectos están agradecidas por la riqueza que tienen, dejarán de preocuparse"
    },
    {
      autor: "Dale Carnegie",
pensamiento: "Intenta formar una conexión de 'cable' entre tu cerebro y tu corazón"
    },
    {
      autor: "Dale Carnegie",
pensamiento: "Una sonrisa enriquecerá el alma de quien la recibe, sin empobrecer a quien la da"
    },
    {
      autor: "Dale Carnegie",
pensamiento: "Las personas rara vez tienen éxito a menos que estén contentas con lo que hacen"
    },
    {
      autor: "David Livingston",
pensamiento: "Iré a cualquier parte siempre que sea el camino a seguir"
    },
    {
      autor: "David V Ambrose",
pensamiento: "Si tienes la voluntad de ganar, estás a mitad de camino Si no tienes la voluntad de ganar, estás a mitad de camino"
    },
    {
      autor: "David Weinbaum",
pensamiento: "El secreto para vivir una vida rica es tener más comienzos que finales"
    },
    {
      autor: "Desbarrolles",
pensamiento: "La verdad que no se entiende será un error"
    },
    {
      autor: "Descrates",
pensamiento: "Creo que por eso existo"
    },
    {
      autor: "Abassy Djamaludin",
pensamiento: "Una mente débil es peor que un cuerpo débil"
    },
    {
      autor: "Donald Kendall",
pensamiento: "El único éxito logrado antes del trabajo está solo en el diccionario"
    },
    {
      autor: "Dr Frank Crane",
pensamiento: "Nuestros mejores amigos y nuestros peores enemigos son nuestros pensamientos La mente puede ser mejor que un médico, un banquero o un amigo de confianza También puede ser más peligrosa que un criminal"
    },
    {
      autor: "Dr Ronald Niednagel",
pensamiento: "Ve tan lejos como puedas ver, y cuando llegues allí, verás más lejos"
    },
    {
      autor: "Dra\u00a0Johnnetta Cole",
pensamiento: "Si quieres ir rápido, ve solo Si quieres llegar lejos, ve acompañado"
    },
    {
      autor: "Dwigt D Esenhower",
pensamiento: "Un intelectual nunca dirá más de lo que sabe"
    },
    {
      autor: "Earl Campbell",
pensamiento: "Los problemas son el precio que pagas por el progreso"
    },
    {
      autor: "Earl Campbell",
pensamiento: "Los problemas son el precio que tienes que pagar por el progreso"
    },
    {
      autor: "Edgar Alnsel",
pensamiento: "La vida humana está llena de peligros, pero ahí radica el encanto"
    },
    {
      autor: "Edmund Burke",
pensamiento: "No puedes planificar el futuro basándote en el pasado"
    },
    {
      autor: "Edward L Curtis",
pensamiento: "El optimismo sin esfuerzo es mero pensamiento que no da fruto"
    },
    {
      autor: "Eduardo de Bono",
pensamiento: "Si eres una de esas personas a las que les gusta esperar a que se presenten las oportunidades, eres parte de la raza humana en general"
    },
    {
      autor: "Edy Murphy",
pensamiento: "Pasé mis 30 arreglando todos los errores que cometí cuando tenía 20"
    },
    {
      autor: "Einstein",
pensamiento: "Trata de no ser un ser humano exitoso, pero trata de ser un ser humano útil"
    },
    {
      autor: "Eisenhower",
pensamiento: "De ahora en adelante no tenemos que perder ni un minuto pensando en las personas que no nos gustan"
    },
    {
      autor: "Elanor Roosevelt",
pensamiento: "Cuando dejamos de hacer contribuciones, empezamos a morir"
    },
    {
      autor: "Elbert Hubbad",
pensamiento: "El mayor error que cometen las personas en la vida es tener miedo constantemente de cometer un error"
    },
    {
      autor: "Elizabeth Browning",
pensamiento: "No llames infelices a las personas antes de que mueran No juzgues el trabajo de alguien antes de que termine"
    },
    {
      autor: "Emerson",
pensamiento: "Creer en ti mismo es el último secreto del éxito"
    },
    {
      autor: "Engelberto Huperdinck",
pensamiento: "Tienes que ser consciente del placer Asegúrate de disfrutarlo y no dejarte controlar por él"
    },
    {
      autor: "Erich Watson",
pensamiento: "La pérdida de riqueza se puede recuperar, la confianza perdida es difícil de recuperar"
    },
    {
      autor: "Francois De La Roche",
pensamiento: "Si no puedes encontrar la paz dentro de ti mismo, no tiene sentido buscar en otra parte"
    },
    {
      autor: "Francois De La Roche",
pensamiento: "Estamos acostumbrados a escondernos de los demás, hasta que finalmente nos ocultamos de nosotros mismos"
    },
    {
      autor: "Francois Roche",
pensamiento: "Estamos más ocupados convenciendo a los demás de que somos felices que sintiéndonos realmente felices nosotros mismos"
    },
    {
      autor: "Frank Crane",
pensamiento: "Puedes ser engañado si confías demasiado, pero tu vida será miserable si no confías lo suficiente"
    },
    {
      autor: "Frank Giblin",
pensamiento: "Sé tú mismo ¿Quién más puede hacerlo mejor que tú mismo?"
    },
    {
      autor: "Franklín",
pensamiento: "Si quieres ser amado, ama y actúa como alguien que merece ser amado"
    },
    {
      autor: "Más completo",
pensamiento: "Un buen ejemplo es el mejor consejo"
    },
    {
      autor: "Galileo Galilei",
pensamiento: "La hierba más fuerte crece en el suelo más duro"
    },
    {
      autor: "Galileo Galilei",
pensamiento: "No puedes enseñarle nada a una persona, solo puedes ayudarlo a descubrir lo que hay dentro de sí mismo"
    },
    {
      autor: "Gandhi",
pensamiento: "Aquellos que son débiles de corazón no podrán ofrecer una disculpa sincera El verdadero perdón solo se otorga a aquellos que son fuertes de corazón"
    },
    {
      autor: "Gandhi",
pensamiento: "La felicidad depende de lo que puedas dar, no de lo que recibas"
    },
    {
      autor: "General Collin Powell",
pensamiento: "No hay ningún secreto para lograr el éxito El éxito puede ocurrir debido a la preparación, el trabajo duro y la voluntad de aprender del fracaso"
    },
    {
      autor: "George B Shaw",
pensamiento: "La vida no se trata de encontrarte a ti mismo La vida se trata de crearte a ti mismo"
    },
    {
      autor: "Jorge III",
pensamiento: "Prefiero perder la corona que hacer algo que me parezca vergonzoso"
    },
    {
      autor: "George Santayana",
pensamiento: "No hay cura para el nacimiento y la muerte, excepto disfrutar lo que hay en el medio"
    },
    {
      autor: "George W",
pensamiento: "La esperanza nunca nos abandona, dejamos la esperanza"
    },
    {
      autor: "Gilbert Chesterton",
pensamiento: "Para ser lo suficientemente inteligente como para obtener todo el dinero que quieres, tienes que ser lo suficientemente estúpido para quererlo"
    },
    {
      autor: "Gothe",
pensamiento: "Todo el conocimiento que tengo puede ser obtenido por otros, pero mi corazón es solo para mí"
    },
    {
      autor: "H N Spieghel",
pensamiento: "No importa lo alto que vuele un pájaro, debe buscar y encontrar su comida en la tierra también"
    },
    {
      autor: "HL Hunt",
pensamiento: "Establece lo que quieras Decide por qué quieres intercambiarlo Establece prioridades y ejecuta"
    },
    {
      autor: "Hal Borland",
pensamiento: "Al ver árboles, entiendo la paciencia Al mirar la hierba, aprecio la perseverancia"
    },
    {
      autor: "Hamka",
pensamiento: "La belleza eterna radica en la belleza de los modales y el conocimiento de una persona, no en su rostro y ropa"
    },
    {
      autor: "Hamka",
pensamiento: "Debemos creer que lo que Dios ha determinado para nosotros es lo mejor"
    },
    {
      autor: "Hamka",
pensamiento: "Atreverse a defender la justicia, incluso cuando se trata de uno mismo, es el pináculo de todo coraje"
    },
    {
      autor: "Hamka",
pensamiento: "La lujuria trae extravío y no es guiada Mientras que la razón es la guía de la virtud La lujuria te dice que sueñes, pero la razón te dice que sopeses"
    },
    {
      autor: "Harriet Braiker",
pensamiento: "Tratar de tener éxito para motivarte, pero tratar de ser siempre perfecto será deprimente"
    },
    {
      autor: "Helen Keller",
pensamiento: "No aprenderemos valor y paciencia si en este mundo solo hay alegría"
    },
    {
      autor: "Henri Ford",
pensamiento: "El fracaso es solo una oportunidad para comenzar de nuevo de manera más inteligente"
    },
    {
      autor: "Henry David Thoreau",
pensamiento: "La amabilidad es la única inversión que no hará daño"
    },
    {
      autor: "Henry Ford",
pensamiento: "Los idealistas son personas que ayudan a otros a prosperar"
    },
    {
      autor: "Henry Ford",
pensamiento: "Creo que es un trabajo duro de todo tipo Es por eso que tan pocas personas disfrutan haciéndolo"
    },
    {
      autor: "Henry Ford",
pensamiento: "La competencia cuyo único objetivo es competir, vencer a los demás, nunca trae muchos beneficios"
    },
    {
      autor: "Henry Longfellow",
pensamiento: "Las vidas de grandes personas nos recuerdan que podemos hacer que nuestras vidas sean sublimes"
    },
    {
      autor: "Henry Thoreau",
pensamiento: "Mi vida es mi entretenimiento y nunca deja de sorprenderme Mi vida es como un drama con tantos actos sin escenas finales"
    },
    {
      autor: "Hubert Humphrey",
pensamiento: "Lo que ves es lo que logras"
    },
    {
      autor: "Imam Al-Ghazali",
pensamiento: "La felicidad radica en la victoria contra la lujuria y el deseo autoritario"
    },
    {
      autor: "Imam Ghazali",
pensamiento: "El desprecio de un criminal es el honor de un hombre honesto"
    },
    {
      autor: "JCF von Schiller",
pensamiento: "Aquellos que contemplan demasiado, lograrán poco"
    },
    {
      autor: "Jack Hyles",
pensamiento: "No utilices a las personas para crear grandes trabajos, utiliza tu trabajo para formar grandes personas"
    },
    {
      autor: "Jackson Brown",
pensamiento: "El mayor error que puedes cometer es creer que estás trabajando para otra persona"
    },
    {
      autor: "Jacques Audiberti",
pensamiento: "La mayor cobardía es cuando demostramos nuestra fuerza ante las debilidades de los demás"
    },
    {
      autor: "James Thurber",
pensamiento: "No mires el pasado con arrepentimiento, no mires el futuro con miedo, mira a tu alrededor con conciencia"
    },
    {
      autor: "Janet Erskine",
pensamiento: "No esperes las circunstancias ideales Tampoco esperes las mejores oportunidades Ninguna de las dos llegará jamás"
    },
    {
      autor: "Jeff Goins",
pensamiento: "La mayoría de las personas exitosas que conozco no son personas ocupadas, son personas enfocadas"
    },
    {
      autor: "Jerry West",
pensamiento: "No puedes hacer mucho en tu vida si solo trabajas los días en los que te sientes bien"
    },
    {
      autor: "Jim Rohn",
pensamiento: "Los muros que construimos para bloquear la tristeza, también nos mantienen cerrados a la felicidad"
    },
    {
      autor: "Jim Rohn",
pensamiento: "Si no diseñas tu propia vida, lo más probable es que estés viviendo el plan de otra persona ¿Qué tienen en mente para ti? No mucho"
    },
    {
      autor: "Jim Ryan",
pensamiento: "La motivación es algo que te ayuda a comenzar El hábito es algo que te mantiene en marcha"
    },
    {
      autor: "Jimi Hendrix",
pensamiento: "Cuando el poder del amor supera el amor al poder, el mundo encuentra la paz"
    },
    {
      autor: "Jimmy Dean",
pensamiento: "No puedo cambiar la dirección del viento, pero puedo ajustar mis velas para llegar a mi destino"
    },
    {
      autor: "Joan Báez",
pensamiento: "No podemos elegir cómo morimos o cuándo Solo podemos decidir cómo vivimos Ahora"
    },
    {
      autor: "John B Gough",
pensamiento: "Si quieres tener éxito, tienes que crear oportunidades para ti mismo"
    },
    {
      autor: "John C Maxwell",
pensamiento: "Trabaja duro ahora, cosecha las recompensas más tarde; holgazanea ahora, sufre las consecuencias más tarde"
    },
    {
      autor: "John C Maxwell",
pensamiento: "Para tratar contigo mismo, usa tu cabeza Para tratar con los demás, usa tu corazón"
    },
    {
      autor: "John C Maxwell",
pensamiento: "Trabaja duro ahora, siéntelo después Perezoso ahora, sufre las consecuencias después"
    },
    {
      autor: "John Craig",
pensamiento: "No importa cuánto puedas hacer, no importa cuán atractiva sea tu personalidad, no puedes llegar lejos si no puedes trabajar con otras personas"
    },
    {
      autor: "John D Rockefeller",
pensamiento: "La persona más pobre es la que no tiene nada más que dinero"
    },
  {
      autor: "John Gardne",
pensamiento: "Si servimos, la vida tendrá más sentido"
    },
    {
      autor: "John Gray",
pensamiento: "En realidad toda adversidad es una oportunidad para que el alma crezca"
    },
    {
      autor: "John Manson",
pensamiento: "Naciste original, así que no hay necesidad de imitar desesperadamente a otras personas"
    },
    {
      autor: "John Maxwell",
pensamiento: "No importa cuánto falles, pero lo que importa es la frecuencia con la que te recuperas"
    },
    {
      autor: "John Q Adams",
pensamiento: "Si tus acciones inspiran a otros a soñar más, aprender más, trabajar más y ser mejores, eres un líder"
    },
    {
      autor: "John Ruskin",
pensamiento: "Creo que la primera prueba para un gran hombre es la humildad"
    },
    {
      autor: "John Ruskin",
pensamiento: "La mayor recompensa por el arduo trabajo de una persona no es lo que gana, sino cómo se desarrolla gracias a ello"
    },
    {
      autor: "John Ruskin",
pensamiento: "La mayor recompensa por el arduo trabajo de una persona no es lo que gana, sino cómo se desarrolla gracias a ello"
    },
    {
      autor: "John Wolfgang",
pensamiento: "Las malas acciones son comunes al hombre, pero es el acto de fingir lo que en realidad genera enemistad y traición"
    },
    {
      autor: "Joseph Addison",
      "citas": "La gracia a menudo nos llega en forma de dolor, pérdida y desilusión; pero si somos pacientes, pronto veremos su verdadera forma"
    },
    {
      autor: "Julia Roberts",
pensamiento: "El verdadero amor no viene a ti, sino que debe venir de tu interior"
    },
    {
      autor: "Junio",
pensamiento: "La integridad de una persona se mide por su conducta, no por su profesión"
    },
    {
      autor: "Kahlil Gibran",
      "citas": "Oramos cuando estamos en problemas y necesitamos algo, también debemos orar con gran alegría y cuando el sustento es abundante"
    },
    {
      autor: "Kahlil Gibran",
pensamiento: "Para comprender el corazón y la mente de una persona, no mires lo que ha logrado, sino lo que aspira a ser"
    },
    {
      autor: "Keri Russell",
pensamiento: "A veces, son las pequeñas decisiones las que pueden cambiar nuestras vidas para siempre"
    },
    {
      autor: "Knute Rockne",
pensamiento: "Cuando el camino se pone difícil, la gente tenaz sigue adelante"
    },
    {
      autor: "Kong Hu Cu",
pensamiento: "Una persona virtuosa siempre se guía por la justicia y siempre trata de cumplir con sus obligaciones"
    },
    {
      autor: "Konrad Adenauer",
pensamiento: "Todos vivimos bajo el mismo cielo, pero no todos tienen el mismo horizonte"
    },
    {
      autor: "Kung Fu-Tze",
pensamiento: "El que es sabio se avergonzará, si sus palabras son mejores que sus acciones"
    },
    {
      autor: "Lao Tse",
pensamiento: "Cuando me doy cuenta de que nada te falta, el mundo entero es mío"
    },
    {
      autor: "Lao Tse",
pensamiento: "Cuando te das cuenta de que no te falta nada, el mundo entero es tuyo"
    },
    {
      autor: "Les Brown",
pensamiento: "Acepta la responsabilidad por ti mismo Date cuenta de que solo tú, nadie más, puede llevarte a donde quieres estar"
    },
    {
      autor: "Louis Gittner",
pensamiento: "Aunque nos enfrentamos a un callejón sin salida, el amor construirá un paso elevado sobre él"
    },
    {
      autor: "Luis Pasteur",
pensamiento: "¿Conoces el secreto de mi éxito en el logro de mis objetivos? Solo tenacidad, nada más y nada menos"
    },
    {
      autor: "Mahatma Gandhi",
pensamiento: "La satisfacción está en el esfuerzo, no en los resultados Esforzarse es la verdadera victoria"
    },
    {
      autor: "Marcel Ayme",
pensamiento: "La humildad es la sala de espera para la perfección"
    },
    {
      autor: "María Sharapova",
pensamiento: "Aprendo mucho de las derrotas Y esas derrotas me hacen más fuerte"
    },
    {
      autor: "Marco Cubano",
pensamiento: "Haz que tus esfuerzos tengan éxito de la única manera: ¡trabaja duro!"
    },
    {
      autor: "Mark Twain",
pensamiento: "La amabilidad es un lenguaje que los sordos pueden oír y los ciegos pueden ver"
    },
    {
      autor: "Marsha Sinetar",
pensamiento: "Haz lo que amas, el dinero seguirá"
    },
    {
      autor: "Martin Luther King",
pensamiento: "Nunca hay un mal momento para hacer lo correcto"
    },
    {
      autor: "Mary McCarthy",
pensamiento: "Incluso si estás en el camino correcto, te adelantarán si te quedas ahí sentado"
    },
    {
      autor: "Máximo Gorki",
pensamiento: "La felicidad siempre parece pequeña cuando está en tus manos Pero trata de dejarla ir y sabrás de inmediato cuán grande y preciosa es la felicidad"
    },
    {
      autor: "María Hemingway",
pensamiento: "Entrénate para no preocuparte Preocuparte nunca soluciona nada"
    },
    {
      autor: "Michael Drury",
pensamiento: "La madurez no es un estado alcanzado con la edad Es un desarrollo desde el amor, el aprendizaje, la lectura y el pensamiento hasta la producción de habilidades"
    },
    {
      autor: "Michael Pritchard",
pensamiento: "No dejas de reírte porque te haces mayor En cambio, envejeces porque dejas de reírte"
    },
    {
      autor: "Miguel de Cervantes",
pensamiento: "Un proverbio es una oración corta basada en una larga experiencia"
    },
    {
      autor: "Miguel de Unamuno",
pensamiento: "No ser amado por otros es triste, pero es aún más triste no poder amar a alguien más"
    },
    {
      autor: "N H Casson",
pensamiento: "La pobreza del alma es más terrible que la pobreza material o material"
    },
    {
      autor: "Natalie Portman",
pensamiento: "No eres rico hasta que tienes algo que el dinero no puede comprar"
    },
    {
      autor: "Nelson Mandela",
pensamiento: "La educación es el arma más poderosa que puedes usar para cambiar el mundo"
    },
    {
      autor: "Norman Peale",
pensamiento: "Guarda esos pensamientos sombríos y molestos, luego revívelos"
    },
    {
      autor: "Monja",
pensamiento: "No es la fuerza, sino la tenacidad lo que los convierte en grandes hombres"
    },
    {
      autor: "OS Marden",
pensamiento: "El progreso es el resultado de concentrar toda la fuerza del alma y la mente en los objetivos a los que se destina"
    },
    {
      autor: "Oliver W Holmes",
pensamiento: "Cuanto más vivimos, más descubrimos que somos similares a otras personas"
    },
    {
      autor: "Oprah Winfrey",
pensamiento: "Hacer lo mejor que puedas en este momento te pondrá en el mejor lugar en el próximo momento"
    },
    {
      autor: "Óscar Wilde",
pensamiento: "Si alguien dice la verdad, está seguro; tarde o temprano; la entenderá"
    },
    {
      autor: "Pablo Picasso",
pensamiento: "Si tu moral está baja, haz algo Si has hecho algo, las cosas no han cambiado, haz algo diferente"
    },
    {
      autor: "Paul Galvin",
pensamiento: "No tengas miedo a los errores La sabiduría suele nacer de los errores"
    },
    {
      autor: "Paul Harvey",
pensamiento: "Nunca he visto un monumento erigido para un pesimista"
    },
    {
      autor: "proverbio chino",
pensamiento: "Atrévete a darte cuenta de los errores y empezar de nuevo"
    },
    {
      autor: "proverbio chino",
pensamiento: "Es verdad ser valiente"
    },
    {
      autor: "proverbio chino",
pensamiento: "Las personas que preguntan son estúpidas en 5 minutos Y las personas que no preguntan seguirán siendo estúpidas para siempre"
    },
    {
      autor: "proverbio chino",
pensamiento: "Cuando escucho, olvido Después de ver, puedo entender Y después de hacer, puedo entender"
    },
    {
      autor: "proverbio chino",
pensamiento: "Las personas que sonríen siempre son más fuertes que las personas que están enojadas"
    },
    {
      autor: "proverbio chino",
pensamiento: "El que mueve montañas comienza moviendo pequeñas piedras"
    },
    {
      autor: "Proverbio inglés",
pensamiento: "Las personas que buscan problemas siempre los encontrarán"
    },
    {
      autor: "Proverbios ingleses",
pensamiento: "La habilidad y la creencia son una fuerza armada invencible"
    },
    {
      autor: "proverbio japonés",
pensamiento: "Una flecha es fácil de romper, pero no diez flechas juntas"
    },
    {
      autor: "proverbio japonés",
pensamiento: "La visión sin acción es un sueño La acción sin visión es una pesadilla"
    },
    {
      autor: "Proverbio alemán",
pensamiento: "Aquellos que nunca han probado lo amargo nunca sabrán lo que es dulce"
    },
    {
      autor: "proverbio latino",
pensamiento: "Al aprender, puedes enseñar Al enseñar, aprendes"
    },
    {
      autor: "proverbio persa",
      "citas": "Lloré porque no tenía zapatos, hasta que vi gente que no tenía pies"
    },
    {
      autor: "Proverbio de Roma",
pensamiento: "La tribulación produce perseverancia La perseverancia produce carácter, y el carácter produce esperanza"
    },
    {
      autor: "Proverbio escocés",
pensamiento: "Cuando la voluntad está lista, las piernas se vuelven ligeras"
    },
    {
      autor: "proverbio español",
pensamiento: "Conocerse a uno mismo es el comienzo de la superación personal"
    },
    {
      autor: "Proverbio tibetano",
pensamiento: "No subestimes a un pequeño rey, al igual que no subestimes a un pequeño río"
    },
    {
      autor: "Proverbio tibetano",
pensamiento: "Cuando un hombre enseña algo, él mismo debe practicarlo"
    },
    {
      autor: "Peter Sinclair",
pensamiento: "Una gran vida es la culminación de grandes pensamientos acompañados de grandes acciones"
    },
    {
      autor: "Phyllis Bottome",
pensamiento: "Hay dos formas de superar la adversidad, cambias las dificultades o te cambias a ti mismo para superarlas"
    },
    {
      autor: "Platón",
pensamiento: "Los sabios hablan porque tienen algo que decir, los necios hablan porque tienen algo que decir"
    },
    {
      autor: "Platón",
pensamiento: "Un hombre sabio habla porque tiene algo que decir Un tonto habla porque debe decir algo"
    },
    {
      autor: "Platón",
pensamiento: "Hacer injusticia es más vergonzoso que sufrir injusticia"
    },
 {
      autor: "Platón",
pensamiento: "Quien no puede liderarse a sí mismo, no puede liderar a las personas"
    },
    {
      autor: "Plauto",
pensamiento: "La paciencia es la mejor medicina para todos los problemas"
    },
    {
      autor: "Plauto",
pensamiento: "Es mucho más fácil empezar bien que terminar bien"
    },
    {
      autor: "Plinio el Viejo",
pensamiento: "La esperanza es el pilar que sostiene el mundo"
    },
    {
      autor: "R A Kartini",
pensamiento: "La victoria gloriosa no se obtiene solo del campo de batalla, sino que a menudo se obtiene del corazón"
    },
    {
      autor: "R Browning",
pensamiento: "nos caemos para levantarnos, nos detenemos para caminar y dormimos para levantarnos"
    },
    {
      autor: "R W Shephred",
pensamiento: "Tienes que lidiar con la depresión, al igual que con un tigre"
    },
    {
      autor: "RH Grant",
pensamiento: "Si contratas a personas que son más inteligentes que tú, demuestras que eres más inteligente que ellos"
    },
    {
      autor: "Rabino Schachtel",
pensamiento: "La felicidad no es tener lo que queremos, sino querer lo que tenemos"
    },
    {
      autor: "Ralph W Emerson",
pensamiento: "Una onza de acción vale más que una tonelada de teoría"
    },
    {
      autor: "Ralph W Emerson",
pensamiento: "Una persona es un gran éxito si se da cuenta, sus fracasos son la preparación para sus victorias"
    },
    {
      autor: "Ralph Waldo Emerson",
pensamiento: "La paz no existe en el mundo exterior, sino en el alma humana misma"
    },
    {
      autor: "Ralph Waldo Emerson",
pensamiento: "Confía en los demás y serán sinceros contigo Trátalos como grandes personas y se mostrarán geniales"
    },
    {
      autor: "René Descartes",
pensamiento: "No basta con tener un buen cerebro Lo importante es usarlo bien"
    },
    {
      autor: "Richard Bach",
pensamiento: "Pregúntate el secreto del éxito Escucha tus respuestas y hazlo"
    },
    {
      autor: "Richard C Miller",
pensamiento: "Si la hierba es más verde del otro lado, agradece que todavía puedes tirarte al suelo para verla"
    },
    {
      autor: "Robert Collier",
pensamiento: "Tus posibilidades de éxito en cualquier situación siempre se pueden medir por cuánto crees en ti mismo"
    },
    {
      autor: "Robert F Kennedy",
pensamiento: "Progreso es una palabra dulce, pero el cambio es la fuerza impulsora y el cambio tiene muchos enemigos"
    },
    {
      autor: "Robert Frost",
pensamiento: "Dos caminos separados por árboles, y tomé el camino menos transitado Y eso es lo que hace la diferencia"
    },
    {
      autor: "Robert Frost",
pensamiento: "La razón por la cual la ansiedad mata a más personas que el trabajo es que más personas se preocupan que trabajan"
    },
    {
      autor: "Robert G Ingersoll",
pensamiento: "Pocas personas ricas tienen posesiones La mayoría de los tesoros los poseen"
    },
    {
      autor: "Roberto Medio",
pensamiento: "La perseverancia puede hacer posible lo imposible, hacer posible la posibilidad y hacer segura la posibilidad"
    },
    {
      autor: "Robert S Lynd",
pensamiento: "Solo un pez estúpido puede ser atrapado dos veces con el mismo cebo"
    },
    {
      autor: "Robert Von Hartman",
pensamiento: "La ambición es como el agua de mar, cuanto más la bebe la gente, más sedienta se vuelve"
    },
    {
      autor: "Robinsori",
pensamiento: "La ansiedad y el miedo son el resultado de la ignorancia y la duda"
    },
    {
      autor: "Romand Rolland",
pensamiento: "Un héroe es alguien que hace lo que es capaz de hacer"
    },
    {
      autor: "Roosevelt",
pensamiento: "Si quieres ser grande, no hables en grande, haz las cosas pequeñas primero"
    },
    {
      autor: "Ross Cooper",
pensamiento: "La única manera de cambiar nuestras vidas es cambiar nuestras mentes"
    },
    {
      autor: "Ruth P Freedman",
pensamiento: "El cambio ocurre cuando una persona se convierte en sí misma, no cuando trata de ser otra persona"
    },
    {
      autor: "Salanter Lipkin",
pensamiento: "Mejórate a ti mismo, pero no menosprecies a los demás"
    },
    {
      autor: "Samuel Sonrisas",
pensamiento: "La forma más rápida de hacer las cosas es terminarlas una a la vez"
    },
    {
      autor: "Satya Sai Baba",
pensamiento: "Hay que olvidar dos cosas, el bien que hemos hecho a los demás y el mal que los demás nos han hecho"
    },
    {
      autor: "Scott Fitzgerald",
pensamiento: "Recuerda, si mantienes la boca cerrada, en realidad has tomado una decisión"
    },
    {
      autor: "Séneca",
pensamiento: "El corazón humano nunca estará en paz hasta que esté en paz consigo mismo"
    },
    {
      autor: "Séneca",
pensamiento: "Vivir es luchar Una buena vida sin un huracán es como un mar muerto"
    },
    {
      autor: "Shackspeare",
pensamiento: "La tristeza solo puede ser superada por personas que la experimentan ellos mismos"
    },
    {
      autor: "Shirley Briggs",
pensamiento: "Atrévete a ser tú mismo, porque podemos hacerlo mejor que nadie"
    },
    {
      autor: "Soe Hok Gie",
pensamiento: "Es mejor estar exiliado que ceder a la hipocresía"
    },
    {
      autor: "Soemantri Metodipuro",
pensamiento: "El primer paso para elegir creer en ti mismo es conocerte a ti mismo"
    },
    {
      autor: "Sófocles",
pensamiento: "Cuando una persona pierde todas las fuentes de felicidad, ya no está viva, sino un cadáver que respira"
    },
    {
      autor: "San Jerónimo",
pensamiento: "Bueno, mejor, mejor Nunca te detengas hasta que lo bueno se vuelva mejor y lo mejor se vuelva mejor"
    },
    {
      autor: "Stephen R Covey",
pensamiento: "La motivación es un fuego desde adentro Si alguien más intenta encenderlo por ti, lo más probable es que el fuego solo arda por un corto tiempo"
    },
    {
      autor: "Steve Jobs",
pensamiento: "Me enorgullezco tanto de lo que no hicimos como de lo que hicimos"
    },
    {
      autor: "Sujiwo Tejo",
pensamiento: "El amor no necesita sacrificio En el momento en que te sientes sacrificado, en ese momento tu amor comienza a desvanecerse"
    },
    {
      autor: "Sydney Harris",
pensamiento: "La verdadera amenaza no es cuando las computadoras comienzan a pensar como humanos, sino cuando los humanos comienzan a pensar como computadoras"
    },
    {
      autor: "Teodoro Rosevelt",
pensamiento: "Haz lo que puedas con lo que tienes y donde estás"
    },
    {
      autor: "Thomas Alba Edison",
pensamiento: "Muchos fracasos en esto se deben a que las personas no se dieron cuenta de lo cerca que estaban del éxito cuando se dieron por vencidas"
    },
    {
      autor: "Thomas Carlyle",
pensamiento: "Ve tan lejos como puedas ver y verás más lejos"
    },
    {
      autor: "Thomas Fuller",
pensamiento: "Una persona que no puede perdonar a los demás es lo mismo que una persona que decide el puente que debe cruzar, porque todos necesitan ser perdonados"
    },
    {
      autor: "Thomas Fuller",
pensamiento: "Ser testigo es creer, pero sentir es verdad"
    },
    {
      autor: "Thomas Jefferson",
pensamiento: "En términos de principio, trata de ser fuerte como una roca En términos de gusto, trata de nadar con la corriente"
    },
    {
      autor: "Tung Desem Waringin",
pensamiento: "Cada tormenta debe pasar y me haré más fuerte"
    },
    {
      autor: "Tyler Durden",
pensamiento: "Después de perderlo todo, somos libres de hacer cualquier cosa"
    },
    {
      autor: "Umar bin Khattab",
pensamiento: "Alcanza el conocimiento y para adquirirlo aprende a ser tranquilo y paciente"
    },
    {
      autor: "Vicosta Efrán",
pensamiento: "Vive como una vela que ilumina a los demás No vivas como una espina que se pincha y hiere a los demás"
    },
    {
      autor: "Víctor Hugo",
pensamiento: "La tristeza es un fruto Dios nunca permite que crezca en una rama que es demasiado débil para soportarlo"
    },
    {
      autor: "Víctor Hugo",
pensamiento: "La mayor felicidad en la vida es la certeza de que eres amado por lo que eres, o más bien amado a pesar de que eres quien eres"
    },
    {
      autor: "Víctor Hugo",
pensamiento: "El problema no es la falta de energía, sino la falta de fuerza de voluntad"
    },
    {
      autor: "Vince Lambardi",
pensamiento: "Ganar no lo es todo, pero la lucha por ganar lo es todo"
    },
    {
      autor: "Virginia Wolf",
pensamiento: "Si no puedes decir las cosas correctas sobre ti mismo, tampoco puedes decir las cosas correctas de otras personas"
    },
    {
      autor: "W Camden",
pensamiento: "Los pájaros que vuelan por la mañana obtendrán la mayor cantidad de gusanos"
    },
    {
      autor: "Walt Disney",
pensamiento: "La forma de empezar es dejar de hablar y empezar a hacer algo"
    },
    {
      autor: "Walter Cronkite",
pensamiento: "El éxito es más permanente si lo logras sin destruir tus principios"
    },
    {
      autor: "Warren Buffett",
pensamiento: "Siempre he creído que sería rico Creo que nunca lo dudé, ni por un minuto"
    },
    {
      autor: "Whitney Young",
pensamiento: "Es mejor estar preparado para una oportunidad y no tenerla que tener una oportunidad y no estar preparado"
    },
 {
      autor: "William AW",
pensamiento: "Lo único que puede interponerse en nuestro camino son las creencias erróneas y las actitudes negativas"
    },
    {
      autor: "William Allen White",
pensamiento: "No tengo miedo del mañana porque he visto el ayer y amo el hoy"
    },
    {
      autor: "Guillermo Arturo",
pensamiento: "Los maestros mediocres hablan Los buenos maestros explican Los grandes maestros demuestran Los grandes maestros inspiran"
    },
    {
      autor: "William F Halsey",
pensamiento: "Todos los problemas se vuelven más pequeños si no los evitas, sino que los enfrentas"
    },
    {
      autor: "William J Johnston",
pensamiento: "El cambio más significativo en la vida es un cambio de actitud La actitud correcta conducirá a la acción correcta"
    },
    {
      autor: "William James",
pensamiento: "Si tienes que elegir y no lo haces, esa es la elección"
    },
    {
      autor: "William James",
pensamiento: "Cree que la vida es valiosa, y tus creencias ayudarán a crear una vida de valor"
    },
    {
      autor: "William Ralph Inge",
pensamiento: "Preocuparse es como pagar intereses por un dinero que nunca podrías pedir prestado"
    },
    {
      autor: "William Shakespeare",
pensamiento: "No enciendas a menudo el fuego del odio contra tus enemigos, porque luego te quemará a ti mismo"
    },
    {
      autor: "William Shakespeare",
pensamiento: "Si eres honesto contigo mismo, como el día se convierte en noche, nunca mentirás a los demás"
    },
    {
      autor: "William Shakespeare",
pensamiento: "Una pulga valiente es una pulga que puede atreverse a desayunar en los labios de un león"
    },
    {
      autor: "Winston Churchill",
pensamiento: "Nos ganamos la vida con lo que recibimos, pero nos ganamos la vida con lo que damos"
    },
    {
      autor: "Wolfgang von Gothe",
pensamiento: "El conocimiento no es suficiente, tenemos que ponerlo en práctica La intención no es suficiente, tenemos que hacerlo"
    },
    {
      autor: "Zachary Scott",
pensamiento: "A medida que envejeces encontrarás que las únicas cosas de las que te arrepientes son las que no hiciste"
    },
    {
      autor: "Zig Zaglar",
pensamiento: "Las piedras angulares para un éxito equilibrado son la honestidad, el carácter, la integridad, la fe, el amor y la lealtad"
    },
    {
      autor: "Zig Zaglar",
pensamiento: "La mayoría de las personas no logran sus objetivos no porque no sean capaces, sino porque no están comprometidas"
    },
    {
      autor: "Zig Zaglar",
pensamiento: "No tenemos que ser geniales cuando empezamos, pero tenemos que empezar a ser geniales"
    }
  ]

module.exports = { pensar }

//CREADO POR JULSMODDERS, DAME LOS CRÉDITOS OK//