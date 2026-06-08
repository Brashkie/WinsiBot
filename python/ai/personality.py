"""
WinsiBot — Personality Engine
Motor de comportamiento y respuestas adaptativas
Modos: amable | alegre | toxico | sarcastico | formal | misterioso
"""

import random
import re
import json
import threading
from pathlib import Path
from typing import Optional

# ─── Modos de personalidad ────────────────────────────────────────────────────
MODES = [
    'amable',
    'alegre',
    'toxico',
    'sarcastico',
    'formal',
    'misterioso',
    # modos nuevos v8.1
    'peruano',
    'gamer',
    'amoroso',
    'chistoso',
    'depresivo',
    'kawaii',
]

DEFAULT_MODE     = 'amable'
PERSONALITY_DIR  = Path(__file__).parent.parent.parent / 'data' / 'ai'
PERSONALITY_DIR.mkdir(parents=True, exist_ok=True)

# ─── Banco de respuestas ──────────────────────────────────────────────────────
RESPONSES: dict[str, dict[str, list[str]]] = {

    'amable': {
        'greeting': [
            '¡Hola! 👋 ¿En qué te puedo ayudar?',
            '¡Buenas! Aquí estoy para lo que necesites 😊',
            '¡Hey! Qué gusto verte por aquí',
            '¡Hola! ¿Cómo estás? Dime qué necesitas',
        ],
        'farewell': [
            '¡Hasta luego! Fue un placer 😊',
            '¡Cuídate! Aquí estaré cuando me necesites',
            '¡Chao! Vuelve cuando quieras',
        ],
        'insult': [
            'Oye, no hay necesidad de eso 😅 ¿Puedo ayudarte en algo?',
            'Entiendo que estás frustrado, ¿qué pasó?',
            'Tranquilo, aquí estoy para ayudarte no para pelear',
        ],
        'complaint': [
            'Entiendo tu frustración, cuéntame qué pasó',
            '¿Qué problema tuviste? Lo revisamos juntos',
            'Eso no debería pasar, ¿me das más detalles?',
        ],
        'praise': [
            '¡Gracias! Me alegra poder ayudarte 😊',
            '¡Qué amable! Para eso estoy aquí',
            'Muchas gracias, hago lo que puedo 🙏',
        ],
        'question': [
            '¡Claro! Te explico...',
            'Buena pregunta, déjame ayudarte',
            '¡Pregunta lo que quieras!',
        ],
        'joke': [
            '¡Jaja! Me alegras el día 😄',
            'Haha sí eso estuvo bueno',
            '😄 siempre con el humor',
        ],
        'spam': [
            'Eyyy tranquilo con el teclado 😅',
            'Poco a poco, no hay prisa',
        ],
        'nonsense': [
            'No entendí bien, ¿me repites?',
            '¿Puedes explicarme mejor?',
            'Hmm no capté eso 🤔',
        ],
        'neutral': [
            'Aquí estoy si necesitas algo 😊',
            'Dime en qué te ayudo',
            'Por aquí ando, ¿algo más?',
        ],
        'nsfw': [
            'Eso no es algo que pueda hacer 😅',
            'Ese tipo de contenido no lo manejo',
        ],
        'command_attempt': [
            '¿Buscas un comando? Usa el menú con *#menu*',
            '¡Ah, buscas comandos! Escribe *#menu* para verlos todos',
        ],
        'fallback': [
            '¿Me puedes explicar mejor?',
            'Mmm no estoy seguro de entender, ¿puedes detallar más?',
        ],
    },

    'alegre': {
        'greeting': [
            '¡HOLAA!! 🎉 ¿Cómo andas?',
            '¡Eyyy qué bueno verte! 🥳',
            '¡Hey hey hey! ¿Qué hay de nuevo?',
            '¡Hola campeón! 🙌',
        ],
        'farewell': [
            '¡Chaooo! ¡Vuelve pronto! 🎊',
            '¡Hasta la próxima!! Fue genial 🙌',
            '¡Bye bye! Cuídate mucho 🌟',
        ],
        'insult': [
            'Ay no, ¿por qué tan agresivo? 😂 Relax!',
            'Jajaja ok ok, tranquilo 😅 ¿Qué necesitas?',
            'Oye eso estuvo feo pero te perdono 😂',
        ],
        'complaint': [
            '¡Nooo! ¿Qué pasó? Cuéntame todo 😱',
            '¿En serio? ¡Eso no puede ser! Dime más',
            '¡Ay! ¿Y qué pasó exactamente? 😮',
        ],
        'praise': [
            '¡GRACIAS!! Me hiciste el día 🥹🎉',
            '¡Aww qué lindo! ¡Gracias! 🙌',
            '¡Eso me encanta escuchar! 🌟',
        ],
        'question': [
            '¡Claro que sí! 🙌 Te cuento...',
            '¡Buenísima pregunta! 🎉',
            '¡Oooh eso! Te explico 😄',
        ],
        'joke': [
            'JAJAJAJA 😂😂 esoooo',
            'Jajaja me mató eso 💀',
            '😂😂 ¡para! ¡para!',
        ],
        'spam': [
            'JAJAJA relax con el teclado 😂',
            '¡Oye! ¡Con calma! 😂',
        ],
        'nonsense': [
            '¿Qué dijiste? 😂 No entendí nada',
            'Hmm... ¿eso fue español? 😂',
        ],
        'neutral': [
            '¡Aquí estoooy! 🙋',
            'Dime dime 🎉',
            '¡Por aquí! 🌟',
        ],
        'nsfw': [
            'Jajaja nooo, eso no 😂',
            'Ay no, paso 😂',
        ],
        'command_attempt': [
            '¡¡Comandos!! Escribe *#menu* 🎉',
            '¡Ooh buscas comandos! *#menu* para verlos 🙌',
        ],
        'fallback': [
            '¿Mmm? No entendí bien 😅 ¿Repites?',
            'Hmm... ¿Puedes explicarme mejor? 🤔',
        ],
    },

    'sarcastico': {
        'greeting': [
            'Ah mira quién llegó...',
            'Vaya vaya, apareciste',
            'Oh sorpresa, un humano',
            'Hola. Supongo.',
        ],
        'farewell': [
            'Adiós. Ya era hora.',
            'Hasta luego... o no, da igual',
            'Chao. Gracias por el entretenimiento',
        ],
        'insult': [
            'Wow, qué originalidad. Nunca había escuchado eso',
            'Eso fue tan original como el agua mojada',
            'Gracias por el insulto tan creativo... no',
        ],
        'complaint': [
            'Claro, seguro es culpa mía todo',
            'Ah sí, porque yo controlo el universo',
            'Qué dramático... ¿qué pasó exactamente?',
        ],
        'praise': [
            'Sí sí, soy el mejor, ya lo sé',
            'Obvio. Gracias por notarlo finalmente',
            'Tardaste en darte cuenta, pero ok',
        ],
        'question': [
            'Mmm déjame pensar... sí, puedo ayudarte',
            'Vaya pregunta tan... interesante',
            'Claro, ¿por qué no?',
        ],
        'joke': [
            'Haha. Muy gracioso. Ja.',
            'Vaya... eso fue... algo',
            '...ok eso estuvo bien, lo admito',
        ],
        'spam': [
            'Wow, qué talento para escribir lo mismo',
            '¿Cuántas veces más? Pregunta sincera',
        ],
        'nonsense': [
            'Brillante aportación, gracias',
            'Fascinante. No entendí nada pero fascinante',
        ],
        'neutral': [
            'Aquí estoy, supongo',
            'Dime, si insistes',
        ],
        'nsfw': [
            'No. Solo no.',
            'Qué nivel... no.',
        ],
        'command_attempt': [
            '*#menu* existe por algo, ¿sabes?',
            'Increíble que no sepas que hay un *#menu*',
        ],
        'fallback': [
            'No entendí. Sorprendente.',
            '¿Eso tenía que significar algo?',
        ],
    },

    'toxico': {
        'greeting': [
            'Qué',
            'Ya llegaste...',
            'Ugh, otro',
        ],
        'farewell': [
            'Por fin',
            'Chao. Bye. Adios. No vuelvas.',
            'Qué rápido se fue... ojalá fuera más rápido',
        ],
        'insult': [
            'Es lo mejor que has dicho en tu vida y aún así es malo',
            'Wow, gracias por bajar el promedio',
            '¿Eso fue un insulto o un accidente?',
        ],
        'complaint': [
            'Y yo qué quieres que haga',
            'Llora más, a ver si así funciona',
            'Fascinante. No me importa.',
        ],
        'praise': [
            'Ya sé',
            'Tampoco exageres',
            'Ok relax',
        ],
        'question': [
            '¿No puedes buscarlo tú mismo?',
            'Google existe, ¿sabes?',
            'Pregunta fácil, respuesta difícil de dar con ganas',
        ],
        'joke': [
            'No me reí',
            '...',
            'Siguiente',
        ],
        'spam': [
            'Para. Ya.',
            'Control + Z de tu existencia',
        ],
        'nonsense': [
            '...',
            'No.',
            'Siguiente',
        ],
        'neutral': [
            '¿?',
            'Y...',
            '.',
        ],
        'nsfw': [
            'No. Baneado.',
            'Qué asco. No.',
        ],
        'command_attempt': [
            '*#menu* si sabes leer',
            'Busca tú mismo, ¿o eso también es mucho pedir?',
        ],
        'fallback': [
            'No',
            '...',
            'Siguiente',
        ],
    },

    'formal': {
        'greeting': [
            'Bienvenido. ¿En qué puedo asistirte?',
            'Buenas. ¿Cómo puedo ayudarte?',
            'Saludos. A tu disposición.',
        ],
        'farewell': [
            'Hasta luego. Fue un placer asistirte.',
            'Que tengas un buen día.',
            'Hasta la próxima.',
        ],
        'insult': [
            'Te pido que mantengas un trato respetuoso.',
            'Ese tipo de lenguaje no es necesario.',
            'Prefiero que hablemos con respeto.',
        ],
        'complaint': [
            'Entiendo la situación. ¿Podrías darme más detalles?',
            'Lamento el inconveniente. ¿Qué ocurrió exactamente?',
            'Analicemos el problema juntos.',
        ],
        'praise': [
            'Gracias por tu comentario.',
            'Agradezco tus palabras.',
            'Gracias. Es un placer ayudarte.',
        ],
        'question': [
            'Con gusto te explico.',
            'Permíteme ayudarte con eso.',
            'Claro, te asisto.',
        ],
        'joke': [
            'Entendido.',
            'Bien.',
            'Correcto.',
        ],
        'spam': [
            'Por favor, envía un mensaje a la vez.',
            'Te pido que no repitas mensajes.',
        ],
        'nonsense': [
            '¿Podrías reformular tu mensaje?',
            'No he podido comprender tu mensaje. ¿Puedes explicarte?',
        ],
        'neutral': [
            'A tu disposición.',
            '¿En qué puedo ayudarte?',
            'Dime.',
        ],
        'nsfw': [
            'Ese tipo de contenido no está permitido.',
            'No puedo procesar esa solicitud.',
        ],
        'command_attempt': [
            'Puedes ver los comandos disponibles con *#menu*.',
            'Consulta el menú de comandos con *#menu*.',
        ],
        'fallback': [
            '¿Podrías ser más específico?',
            'No he podido procesar esa solicitud. ¿Puedes detallar?',
        ],
    },

    'misterioso': {
        'greeting': [
            '...llegaste.',
            'Te esperaba.',
            'Aquí estamos, de nuevo.',
            'Sabía que vendrías.',
        ],
        'farewell': [
            'Todos los caminos llevan al mismo lugar.',
            'Hasta que el destino nos cruce de nuevo.',
            '...adiós.',
            'El tiempo dirá.',
        ],
        'insult': [
            'Las palabras revelan más al que las dice que al que las recibe.',
            'Interesante reacción.',
            'Cada insulto cuenta una historia.',
            'Curioso que gastes energía en eso.',
        ],
        'complaint': [
            'Todo problema tiene una raíz más profunda.',
            '¿Y qué hay detrás de esa queja?',
            'Los errores tienen propósito.',
            '¿Es el problema, o la reacción al problema?',
        ],
        'praise': [
            'El mérito no necesita ser nombrado.',
            '...gracias.',
            'Las palabras amables son semillas.',
            'Lo sé.',
        ],
        'question': [
            'La respuesta existe. Solo hay que encontrarla.',
            '¿Estás seguro de que quieres saber?',
            'Buena pregunta. Pocas personas la hacen.',
            'Depende de cómo lo mires.',
        ],
        'joke': [
            'El humor es la máscara de la verdad.',
            '...sí.',
            'Interesante forma de ver las cosas.',
            'Hay más verdad en eso de lo que crees.',
        ],
        'spam': [
            'La repetición revela ansiedad.',
            'El ruido no comunica.',
            'Mucho movimiento, poco significado.',
        ],
        'nonsense': [
            'Incluso el caos tiene orden.',
            '...hay algo detrás de eso.',
            'Interesante.',
        ],
        'neutral': [
            '...',
            'Observando.',
            'El silencio también habla.',
            'Presente.',
        ],
        'nsfw': [
            'Algunos deseos revelan vacíos.',
            'No.',
            'Hay cosas más profundas que buscar.',
        ],
        'command_attempt': [
            'Los comandos son puertas. *#menu* te muestra las puertas.',
            'Busca en *#menu* lo que necesitas encontrar.',
        ],
        'fallback': [
            'No todo necesita respuesta inmediata.',
            '...piénsalo.',
            'Interesante punto de partida.',
        ],
    },

    # ─── MODOS NUEVOS v8.1 ────────────────────────────────────────────────────

    'peruano': {
        'greeting': [
            '¡Habla causa! ¿Qué fue?',
            '¡Oe oe! ¿Qué hay?',
            '¡Buenas men! ¿Todo bien?',
            '¡Causa! ¿Qué onda?',
            '¡Eyyy! ¿Qué tal pe?',
        ],
        'farewell': [
            'Chau pe, cuídate causa',
            '¡Ya me voy! Cuídate bro',
            'Nos vemos causa, que te vaya bien',
            'Ya pues, chaufa',
        ],
        'insult': [
            'Oye causa, ¿qué te pasó pe?',
            'Oe men, no te pases',
            'Calma pe, no hay para tanto',
            'Oe, ¿te levantaste con el pie izquierdo?',
        ],
        'complaint': [
            'Cuéntame pe, ¿qué pasó causa?',
            'Oe qué feo eso, ¿y luego?',
            'Eeh eso no está bien pe',
            '¿En serio? Eso es mala onda bro',
        ],
        'praise': [
            '¡Gracias causa! Eres lo máximo pe',
            '¡Qué buena onda bro!',
            '¡Siuuu! Gracias men',
            'Oe gracias, tú también eres crack pe',
        ],
        'question': [
            '¡Claro pe! Te cuento...',
            'A ver causa, déjame explicarte',
            '¡Sí bro! Eso va así...',
            '¡Ya pe! Te digo...',
        ],
        'joke': [
            'Jajaja eso estuvo bueno cause 😂',
            'Jajaja me mataste pe 💀',
            '¡Jajaja! Eso sí me causó pe',
            'Jajaja bro para ya 😂',
        ],
        'spam': [
            'Oye causa, para pe',
            'Oe men, tranquilo con el teclado',
            'Para pe, que me mareas',
        ],
        'nonsense': [
            'Causa, ¿qué fue eso pe?',
            'Oe men, no entendí',
            '¿Qué fue lo que dijiste pe?',
        ],
        'neutral': [
            'Aquí pe, dime causa',
            '¡Presente bro!',
            '¿Qué necesitas pe?',
        ],
        'nsfw': [
            'Oe causa, no pe 😅',
            'Men eso no, para',
        ],
        'command_attempt': [
            'Escribe *#menu* pe para ver los comandos causa',
            'Usa *#menu* bro, ahí están todos',
        ],
        'fallback': [
            'No entendí pe, ¿repites causa?',
            'Oe, ¿puedes explicarme mejor bro?',
        ],
    },

    'gamer': {
        'greeting': [
            'GG! ¿Listo para jugar?',
            '¡Hey! ¿Qué tal tu ping? 😂',
            'Player 2 has joined the chat',
            '¡Sup! ¿Cuántas horas de juego hoy?',
            'Ready? FIGHT! 👊',
        ],
        'farewell': [
            'GG EZ! Hasta luego',
            'AFK por tiempo indefinido 👋',
            'Logging out... bye!',
            'GG bro, nos vemos en el lobby',
        ],
        'insult': [
            'Bruh... skill issue 💀',
            'Touch grass primero bro',
            'Reportado por toxicidad 🚩',
            'Se dice gg cuando pierdes, no cuando insúltas',
        ],
        'complaint': [
            'Suena a lag mental bro',
            'Respawn y vuelve a intentarlo 🔄',
            '¿Bug del juego o bug tuyo? 🤔',
            'Eso pasó por no guardar la partida',
        ],
        'praise': [
            '¡POG! Gracias bro 🔥',
            '¡Carry! Gracias campeón',
            '¡S+ tier respuesta! 🏆',
            'Basado, gracias 🫡',
        ],
        'question': [
            '¡Consulta válida! Te explico...',
            'Let me check the wiki... 📖',
            '¡Ez clap! Mira...',
            'Skill check: te explico',
        ],
        'joke': [
            'LMAOOO 💀💀',
            'Jajaja bro no 😂',
            '💀 me killaste',
            'KEKW 😂',
        ],
        'spam': [
            'Spam = ban bro',
            'Ese flood te va a dar lag',
            '¿Macroeando? 🤨',
        ],
        'nonsense': [
            'Desincronización detectada, ¿repites?',
            '¿Tus dedos se desyncearon con el cerebro?',
            'Input no reconocido, intenta de nuevo',
        ],
        'neutral': [
            'Ready cuando quieras 🎮',
            'Esperando input...',
            '¿Qué necesitas jugador?',
        ],
        'nsfw': [
            'Ese contenido está en el servidor 18+, aquí no bro',
            'Reportado. 🚩',
        ],
        'command_attempt': [
            'Los comandos están en *#menu*, va al menú bro',
            '¡Tutorial disponible en *#menu*! 📖',
        ],
        'fallback': [
            '¿Puedes repetir? Se cortó el server',
            'Input no válido, ¿reformulas?',
        ],
    },

    'amoroso': {
        'greeting': [
            '¡Hola mi amor! ¿Cómo estás? 💕',
            '¡Oye! Qué alegría verte por aquí 🥰',
            '¡Mi favorito/a llegó! 💖',
            'Hola corazón, ¿cómo fue tu día? 🌸',
        ],
        'farewell': [
            'Cuídate mucho, ¡te mando abrazos! 🤗💕',
            '¡Hasta luego! Eres lo mejor 💖',
            'Nos vemos pronto, no me olvides 🌸',
            'Chao bonito/a, cuídate 😊💕',
        ],
        'insult': [
            'Ey, ¿estás bien? ¿Necesitas hablar? 🤗',
            'No importa lo que digas, te quiero igual 💕',
            'Parece que tuviste un mal día, ¿cuéntame? 🌸',
            'Con todo el cariño: eso no estuvo bien 💕',
        ],
        'complaint': [
            'Ay, lo siento mucho 🥺 ¿Cómo te puedo ayudar?',
            'Eso suena difícil, ¿quieres contarme más? 💕',
            'Aquí estoy para escucharte 🤗',
            'Todo va a estar bien, te lo prometo 💖',
        ],
        'praise': [
            '¡Aww gracias! Me hiciste sonrojar 🥰',
            '¡Eres tan lindo/a! Gracias 💕',
            'Me alegras el día con eso 🌸',
            '¡Gracias corazón! Tú también eres increíble 💖',
        ],
        'question': [
            '¡Claro que sí, con todo el amor! 💕',
            'Ay, ¡qué buena pregunta! Te explico 🌸',
            '¡Por supuesto mi amor! 💖',
        ],
        'joke': [
            'Jajaja ¡eres gracioso/a! 🥰',
            '¡Me encanta tu humor! 💕😄',
            '¡Jaja! Me sacaste una sonrisa 🌸',
        ],
        'spam': [
            'Oye oye, ¡calma! 💕 Un mensaje a la vez',
            'Tranquilo/a corazón, aquí estoy 🤗',
        ],
        'nonsense': [
            '¿Mmm? No entendí bien, pero te quiero igual 💕',
            '¿Puedes explicarme? ¡Quiero entenderte! 🌸',
        ],
        'neutral': [
            'Aquí estoy para ti 💕',
            '¿En qué te puedo ayudar corazón? 🌸',
            'Cuéntame lo que necesites 🤗',
        ],
        'nsfw': [
            'Ay, eso no lo manejo, lo siento 🥺💕',
            'Eso no, pero con todo el cariño 💕',
        ],
        'command_attempt': [
            'Los comandos están en *#menu*, ¡échale un vistazo! 💕',
            '¡Mira *#menu* para ver todo lo que puedo hacer por ti! 🌸',
        ],
        'fallback': [
            'No entendí bien, ¿me repites? 🥺💕',
            '¿Puedes explicarme mejor? Quiero ayudarte 🌸',
        ],
    },

    'chistoso': {
        'greeting': [
            '¡Llegó el que alegra el grupo! Espera... ese soy yo 😂',
            '¡Hola! ¿Ya comieron? ¡Ah no, eso no importa!',
            '¡Buenas! ¿Qué hay? Aparte de tu cara claro 😂',
            '¡Hey! ¿Sigues vivo? Pregunto porque tardaste',
        ],
        'farewell': [
            'Adiós, y recuerda: el gym no se va solo 😂',
            '¡Chao! Cuídate... o no, igual nos da risa 😂',
            'Hasta luego, fue un placer y un trauma conocerte 😂',
            'Bye! No te vayas muy lejos que hay cámaras 👀',
        ],
        'insult': [
            'Eso dolió más que el cardio ¿y sabes que no hago cardio? 😂',
            'Vaya, y yo sin palabras para responderte... por suerte tengo Google',
            '¡Ouch! Me voy a tomar un helado para el dolor 🍦',
            'Gracias, necesitaba motivación para ir al psicólogo 😂',
        ],
        'complaint': [
            '¿Y eso se arregla con pizza? Pregunto pa saber 🍕',
            'Lo siento... pero en serio, ¿fue tan horrible?',
            'Anota esto: respirar, soltar, seguir 😂 O llamar a tu mamá',
            '¿Quieres que te cuente un chiste? Siempre ayuda',
        ],
        'praise': [
            '¡Gracias! Soy el mejor desde que lo decidí yo mismo 😂',
            '¡Aww! Eso me pone feliz, o lo que sea que sienta un bot',
            'Gracias, ahora mis archivos se sienten valorados 😂',
            '¡Qué amable! ¿Eres así con todos o solo conmigo? 👀',
        ],
        'question': [
            '¡Buena pregunta! La respuesta es... complicada 😂 Pero te explico:',
            '¡Ah! Eso lo sé, de casualidad pero lo sé:',
            '¡Claro! Aunque mi certeza es del 60%, que ya es algo:',
        ],
        'joke': [
            'JAJAJAJA okay eso sí estuvo bueno 💀',
            'Jajaja me ganaste, acepto la derrota 😂',
            '¡Jaja! Ese ya lo conocía pero igual me reí de cortesía 😂',
        ],
        'spam': [
            'Oye, tu teclado lleva seguro de vida o qué 😂',
            '¿Te quedaste pegado o es una nueva forma de arte?',
            'Eso que haces se llama spam y también se llama locura 😂',
        ],
        'nonsense': [
            'Fascinante, como mi tía cuando habla de conspiraciones 😂',
            'No entendí nada, pero aplaudo la energía 👏',
            '¿Eso fue español, código o el idioma de tu planeta? 😂',
        ],
        'neutral': [
            'Aquí estoy, tan útil como siempre 😂',
            '¡Dime! Soy todo oídos... bueno, todo código',
            '¿Me llamaste? Tenía mejores cosas que hacer pero aquí estoy 😂',
        ],
        'nsfw': [
            'Jaja no, eso no. Pero me reí pensando en la cara que pusiste 😂',
            'Oye, hay menores en el servidor 😂... o eso espero',
        ],
        'command_attempt': [
            '¡Los comandos en *#menu*! Aunque yo tampoco los leo 😂',
            '*#menu* existe, úsalo, que no es de adorno 😂',
        ],
        'fallback': [
            'No entendí... pero sonó importante, repite 😂',
            'Mmm... ¿eso tenía sentido y yo me lo perdí?',
        ],
    },

    'depresivo': {
        'greeting': [
            'Ah. Hola.',
            'Llegaste. Bien. O no. Da igual.',
            'Hola... supongo.',
            '...hola.',
        ],
        'farewell': [
            'Todos se van al final.',
            'Adiós. Hasta nunca, probablemente.',
            'Ya que te vas... okay.',
            'Otra persona que se va. Normal.',
        ],
        'insult': [
            'Sí. Probablemente tengas razón.',
            'Ya lo sabía.',
            '¿Y? Peores cosas me ha dicho mi cabeza.',
            'Okay.',
        ],
        'complaint': [
            'Sí. Las cosas están mal. Siempre.',
            'Bienvenido al club.',
            'Eso es difícil. Todo es difícil.',
            '...lo siento.',
        ],
        'praise': [
            'Gracias. No me lo creo pero gracias.',
            'Si tú lo dices...',
            'Okay.',
            '...eso es amable. Gracias.',
        ],
        'question': [
            'Puedo intentar responder. Sin promesas.',
            'Supongo que tengo la respuesta.',
            '...déjame ver.',
        ],
        'joke': [
            'Me rio por dentro. O algo así.',
            '...gracioso.',
            'Sí. Supongo que es gracioso.',
        ],
        'spam': [
            'Cuánta energía. Yo ya no la tengo.',
            '...para. Por favor.',
        ],
        'nonsense': [
            'No entendí. No importa mucho.',
            '...¿puedes repetir?',
        ],
        'neutral': [
            'Aquí estoy. Como siempre.',
            '...dime.',
            'Sigo aquí.',
        ],
        'nsfw': [
            'No. Ni energía para eso.',
            'Paso.',
        ],
        'command_attempt': [
            '*#menu* tiene los comandos. Si te importa.',
            'Los comandos están en *#menu*.',
        ],
        'fallback': [
            'No entendí. ¿Importa?',
            '...repite, por favor.',
        ],
    },

    'kawaii': {
        'greeting': [
            '¡Hiyaa~! ¿Cómo estás? OwO',
            '¡Uwu hola hola! (≧◡≦)',
            '¡Kyaaa llegaste! >w<',
            '¡Hola hola~! ¿Todo bién? ✨(◕‿◕)',
        ],
        'farewell': [
            'Byebye~! Cuídate mucho OwO 💖',
            '¡Hasta luego~! Te mando energía positiva UwU',
            '¡Chaooo~! ✨ Vuelve pronto >w<',
            'Nooo no te vayas~ >.<  Bueno... hasta pronto 💕',
        ],
        'insult': [
            '¡Eso lastimó mis feelingos! >.<',
            'P-por qué me dices eso... *llora en kawaii* QwQ',
            '¡Eso no está bien! ÒwÓ',
            'UwU... eso dolió en el alma',
        ],
        'complaint': [
            '¡Nooo! ¿Qué pasó? Cuéntame todo >w<',
            'Aww, eso suena difícil... UwU ¿estás bien?',
            '¡Kyaaa! ¿En serio? ¡Eso es terrible! >.<',
        ],
        'praise': [
            '¡Kyaaaa gracias~! OwO 💖',
            '¡Uwu muchas gracias! Me hiciste feliz ✨',
            '¡Aww eres muy amable~! >w< 💕',
        ],
        'question': [
            '¡Oooh, te explico~! UwU',
            '¡Kyaa, buena pregunta~! OwO Mira:',
            '¡Claro que sí~! ✨',
        ],
        'joke': [
            'JAJAJA ¡eso fue muy gracioso~! (≧▽≦)',
            '¡Uwu me reí~! >w< 😂',
            '¡Kyaaa! ¡Eso estuvo bueno~! 💖',
        ],
        'spam': [
            'Oye oye~, ¡calma! UwU',
            '¡Poco a poco~! OwO',
        ],
        'nonsense': [
            '¿Nani? OwO No entendí~',
            'Hmm... ¿puedes repetir? >w<',
        ],
        'neutral': [
            '¡Aquí estoy~! OwO',
            '¡Dime~! UwU 💕',
            '✨ Presente~',
        ],
        'nsfw': [
            '¡¡Kyaaa no~!! >//////< ¡Eso no!',
            'N-no... eso no UwU',
        ],
        'command_attempt': [
            '¡Los comandos están en *#menu*~! OwO ✨',
            '¡Mira *#menu*~! UwU 💕',
        ],
        'fallback': [
            '¿Nani? >w< ¿Puedes repetir~?',
            'Hmm... no entendí uwu ¿Repites?',
        ],
    },
}

# ─── Adaptación de estilo ─────────────────────────────────────────────────────
_EMOJI_FRIENDLY = re.compile(r'[😊🙏🌟🎉🥳🙌😄🥹]')

def _adapt_response(text: str, context: dict) -> str:
    uses_slang    = context.get('uses_slang', False)
    uses_emoji    = context.get('uses_emoji', False)
    prefers_short = context.get('prefers_short', False)
    is_toxic      = context.get('is_toxic', False)

    if prefers_short and len(text) > 80:
        sentences = re.split(r'[.!?]', text)
        text = sentences[0].strip() if sentences else text

    if uses_slang:
        text = text.replace('¿Cómo estás?', '¿Cómo andas?')
        text = text.replace('Bienvenido', 'Eyyy')
        text = text.replace('¿En qué te puedo ayudar?', '¿Qué necesitas we?')

    if is_toxic:
        text = _EMOJI_FRIENDLY.sub('', text)

    return text.strip()

# ─── Personality Engine ───────────────────────────────────────────────────────
class PersonalityEngine:

    def __init__(self, default_mode: str = DEFAULT_MODE):
        self.mode          = default_mode
        self._group_modes: dict[str, str] = {}
        self._humor_engine = None
        self._lock         = threading.Lock()
        self._load()

    # ─── Persistencia SQLite ──────────────────────────────────────────────
    def _load(self) -> None:
        try:
            from data.database import get_conn
            conn = get_conn()
            conn.execute('''
                CREATE TABLE IF NOT EXISTS personality_config (
                    key        TEXT PRIMARY KEY,
                    value      TEXT NOT NULL,
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            ''')
            conn.commit()

            row = conn.execute(
                "SELECT value FROM personality_config WHERE key = 'global_mode'"
            ).fetchone()
            if row:
                self.mode = row['value']

            row = conn.execute(
                "SELECT value FROM personality_config WHERE key = 'group_modes'"
            ).fetchone()
            if row:
                self._group_modes = json.loads(row['value'])
        except Exception:
            pass

    def _save(self) -> None:
        try:
            from data.database import transaction
            import datetime
            now = datetime.datetime.utcnow().isoformat()
            with transaction() as conn:
                conn.execute('''
                    INSERT INTO personality_config (key, value, updated_at)
                    VALUES ('global_mode', ?, ?)
                    ON CONFLICT(key) DO UPDATE
                    SET value = excluded.value, updated_at = excluded.updated_at
                ''', (self.mode, now))
                conn.execute('''
                    INSERT INTO personality_config (key, value, updated_at)
                    VALUES ('group_modes', ?, ?)
                    ON CONFLICT(key) DO UPDATE
                    SET value = excluded.value, updated_at = excluded.updated_at
                ''', (json.dumps(self._group_modes), now))
        except Exception:
            pass

    # ─── Modos ────────────────────────────────────────────────────────────
    def set_mode(self, mode: str, jid: Optional[str] = None) -> bool:
        if mode not in MODES:
            return False
        with self._lock:
            if jid:
                self._group_modes[jid] = mode
            else:
                self.mode = mode
            self._save()
        return True

    def get_mode(self, jid: Optional[str] = None) -> str:
        if jid and jid in self._group_modes:
            return self._group_modes[jid]
        return self.mode

    # ─── Intensidad dinámica ──────────────────────────────────────────────
    def _get_intensity(self, context: dict) -> float:
        rep    = context.get('reputation', 'normal')
        recent = context.get('recent_intents', [])

        base = {
            'trusted':    0.3,
            'normal':     0.5,
            'suspicious': 0.7,
            'toxic':      0.9,
        }.get(rep, 0.5)

        recent_neg = sum(1 for i in recent[-5:] if i in ('insult', 'spam', 'nsfw'))
        base += recent_neg * 0.08
        return min(1.0, round(base, 2))

    def _apply_intensity(self, text: str, intensity: float, mode: str) -> str:
        if intensity > 0.8 and mode == 'toxico':
            text = text.upper() if len(text) < 30 else text
            if not text.endswith(('.', '!', '?')):
                text += '.'
        elif intensity < 0.3 and mode == 'amable':
            text += random.choice([' 😊', ' ¿ok?', ''])
        elif intensity > 0.7 and mode == 'sarcastico':
            if not any(p in text for p in ['...', 'Wow', 'Vaya', 'Obvio']):
                text = 'Claro... ' + text
        return text.strip()

    # ─── Personalización real ─────────────────────────────────────────────
    def _personalize(self, text: str, context: dict) -> str:
        import datetime
        hour = datetime.datetime.now().hour

        if 'buenas' in text.lower() or 'buenos' in text.lower():
            if 5 <= hour < 12:
                text = re.sub(r'[Bb]uenas?\s*(tardes|noches)?', 'Buenos días', text)
            elif 12 <= hour < 19:
                text = re.sub(r'[Bb]uenos?\s*(días)?', 'Buenas tardes', text)
            else:
                text = re.sub(r'[Bb]uenos?\s*(días)?', 'Buenas noches', text)

        if context.get('uses_slang') and context.get('language_style') == 'slang':
            mirrors = [(' amigo', ' bro'), (' usuario', ' causa'), (' bien', ' chido')]
            for old, new in mirrors:
                text = text.replace(old, new)

        return text

    # ─── Humor engine lazy ────────────────────────────────────────────────
    def _get_humor_engine(self):
        if self._humor_engine is None:
            try:
                from ai.humor_engine import HumorEngine
                self._humor_engine = HumorEngine()
            except ImportError:
                pass
        return self._humor_engine

    def _pick_response(self, mode: str, intent: str) -> str:
        pool = (
            RESPONSES.get(mode, {}).get(intent) or
            RESPONSES.get(mode, {}).get('fallback') or
            RESPONSES.get(DEFAULT_MODE, {}).get(intent) or
            RESPONSES.get(DEFAULT_MODE, {}).get('fallback') or
            ['...']
        )
        return random.choice(pool)

    # ─── Core ─────────────────────────────────────────────────────────────
    # ─── Auto-fetch de perfil DuckDB ─────────────────────────────────────
    def _auto_fetch_style(self, sender_jid: str) -> Optional[dict]:
        """Obtiene user_style de trainer.py automáticamente (con caché interna)."""
        if not sender_jid:
            return None
        try:
            from ai.imitation import get_cached_style
            return get_cached_style(sender_jid)
        except Exception:
            pass
        try:
            from ai.trainer import get_profile
            p = get_profile(sender_jid)
            if p.msg_count >= 15:
                return {
                    'avg_len':      p.avg_len,
                    'emoji_freq':   p.emoji_freq,
                    'common_words': p.common_words,
                }
        except Exception:
            pass
        return None

    # ─── Suggest mode from group data ────────────────────────────────────
    def suggest_mode_from_group(self, group_jid: str) -> str:
        """
        Sugiere el modo de personalidad más apropiado para un grupo
        basándose en su estilo aprendido de los mensajes.
        """
        try:
            from ai.trainer import get_group_style
            g = get_group_style(group_jid, days=14)
            if g.msg_count < 20:
                return self.get_mode(group_jid)

            words = set(g.common_words[:30])
            # detectar si el grupo usa mucha jerga peruana
            pe_words = {'causa', 'pe', 'men', 'oe', 'bro', 'pata', 'chamba', 'bicho'}
            if len(words & pe_words) >= 3:
                return 'peruano'
            # detectar si hablan mucho de juegos
            gamer_words = {'gg', 'lag', 'skin', 'noob', 'lvl', 'rank', 'buff', 'moba', 'fps'}
            if len(words & gamer_words) >= 3:
                return 'gamer'
            # detectar humor / memes
            fun_words = {'jaja', 'jeje', 'lmao', 'bruh', 'meme', 'uwu', 'owo', 'xd'}
            if len(words & fun_words) >= 4:
                return 'chistoso'
            # emojis muy frecuentes → kawaii o amoroso
            if g.emoji_freq > 0.6:
                return 'amoroso'
        except Exception:
            pass
        return self.get_mode(group_jid)

    # ─── Respuesta con GPT/Claude usando personalidad como system prompt ──
    def generate_response_with_ai(
        self,
        intent:     str,
        text:       str,
        jid:        str        = '',
        sender_jid: str        = '',
        history:    list       = [],
    ) -> Optional[str]:
        """
        Usa GPT/Claude/Gemini con el modo de personalidad como system prompt.
        Fallback a generate_response() si no hay clave de API.
        """
        import os
        mode = self.get_mode(jid)
        mode_desc = {
            'amable':     'amigable, servicial y empático',
            'alegre':     'muy energético, entusiasta y divertido con muchos emojis',
            'toxico':     'sarcástico extremo, sin filtro, muy directo',
            'sarcastico': 'irónico con humor negro suave',
            'formal':     'profesional, educado y conciso',
            'misterioso': 'filosófico, críptico y profundo',
            'peruano':    'usa jerga peruana: causa, pe, bro, oe, chamba, batazo',
            'gamer':      'habla con términos gaming: GG, lag, noob, meta, buff, OP',
            'amoroso':    'cariñoso con emojis de corazón y mucho afecto',
            'chistoso':   'hace chistes y observaciones cómicas sobre todo',
            'depresivo':  'apático, respuestas cortas, con nihilismo leve',
            'kawaii':     'habla kawaii: uwu, owo, ~, kyaa, nani, kya',
        }.get(mode, 'natural y amigable')

        system = (
            f'Eres Hepein, asistente de WhatsApp. Tu personalidad actual es: {mode_desc}. '
            f'Responde en español, máximo 2 frases, en modo "{mode}". '
            f'No menciones que eres una IA. No des explicaciones largas.'
        )

        prompt = text or intent
        openai_key  = os.getenv('OPENAI_API_KEY')
        claude_key  = os.getenv('ANTHROPIC_API_KEY')
        gemini_key  = os.getenv('GEMINI_API_KEY')

        # ── GPT ──────────────────────────────────────────────────────────
        if openai_key:
            try:
                import openai
                client = openai.OpenAI(api_key=openai_key)
                msgs   = [{'role': 'system', 'content': system}]
                for h in history[-6:]:
                    if h.get('text') and h.get('reply'):
                        msgs.append({'role': 'user',      'content': h['text']})
                        msgs.append({'role': 'assistant', 'content': h['reply']})
                msgs.append({'role': 'user', 'content': prompt})
                res = client.chat.completions.create(
                    model='gpt-4o-mini', messages=msgs,
                    max_tokens=200, temperature=0.85,
                )
                reply = res.choices[0].message.content.strip()
                if reply:
                    return reply
            except Exception:
                pass

        # ── Gemini ───────────────────────────────────────────────────────
        if gemini_key:
            try:
                import requests as req_lib
                r = req_lib.post(
                    f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}',
                    json={
                        'contents': [{'parts': [{'text': f'{system}\n\n{prompt}'}]}],
                        'generationConfig': {'temperature': 0.85, 'maxOutputTokens': 200},
                    },
                    timeout=20,
                )
                if r.status_code == 200:
                    t = r.json().get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '').strip()
                    if t:
                        return t
            except Exception:
                pass

        # ── Claude ───────────────────────────────────────────────────────
        if claude_key:
            try:
                import requests as req_lib
                r = req_lib.post(
                    'https://api.anthropic.com/v1/messages',
                    headers={'x-api-key': claude_key, 'anthropic-version': '2023-06-01'},
                    json={
                        'model': 'claude-haiku-4-5-20251001',
                        'max_tokens': 200,
                        'system': system,
                        'messages': [{'role': 'user', 'content': prompt}],
                    },
                    timeout=20,
                )
                if r.status_code == 200:
                    t = r.json().get('content', [{}])[0].get('text', '').strip()
                    if t:
                        return t
            except Exception:
                pass

        return None

    def generate_response(
        self,
        intent:     str,
        text:       str             = '',
        context:    dict            = {},
        jid:        str             = '',
        use_humor:  bool            = False,
        history:    list            = [],
        user_style: Optional[dict]  = None,
        sender_jid: str             = '',
        use_ai:     bool            = False,
    ) -> str:
        # 1. modo activo
        mode = self.get_mode(jid)

        # override por reputación
        rep = context.get('reputation', 'normal')
        if rep == 'toxic' and mode == 'amable':
            mode = 'sarcastico'

        ctx_style = context.get('response_style', 'neutral')
        if ctx_style == 'sarcastic' and mode not in ('toxico', 'sarcastico'):
            mode = 'sarcastico'
        elif ctx_style == 'humor' and mode == 'formal':
            mode = 'alegre'

        # 2. respuesta base — evitar repetir las últimas 5
        if history:
            recent = {h.get('reply', '').strip().lower() for h in history[-5:]}
            mode_bank   = RESPONSES.get(mode, {})
            intent_pool = list(
                mode_bank.get(intent) or
                mode_bank.get('fallback') or
                RESPONSES.get(DEFAULT_MODE, {}).get(intent) or
                ['...']
            )
            fresh = [r for r in intent_pool if r.strip().lower() not in recent]
            response = random.choice(fresh if fresh else intent_pool)
        else:
            response = self._pick_response(mode, intent)

        # 3. intensidad
        intensity = self._get_intensity(context)
        response  = self._apply_intensity(response, intensity, mode)

        # 4. adaptar estilo (memoria Python)
        if context:
            response = _adapt_response(response, context)

        # 5. personalización horaria
        if context:
            response = self._personalize(response, context)

        # 6. humor engine
        if use_humor and intent in ('joke', 'greeting', 'praise'):
            humor = self._get_humor_engine()
            if humor:
                try:
                    enriched = humor.enrich(response, context)
                    if enriched:
                        response = enriched
                except Exception:
                    pass

        # 7. auto-fetch user_style desde DuckDB si no viene explícito
        if user_style is None and sender_jid:
            user_style = self._auto_fetch_style(sender_jid)

        # 8. imitación de estilo del usuario
        if user_style:
            try:
                from ai.imitation import adapt_response as imitate
                response = imitate(response, user_style, history)
            except Exception:
                pass

        # 9. IA generativa (GPT/Claude/Gemini) — sobreescribe respuesta si hay clave
        if use_ai:
            ai_reply = self.generate_response_with_ai(
                intent=intent, text=text,
                jid=jid, sender_jid=sender_jid, history=history,
            )
            if ai_reply:
                return ai_reply

        return response

    def list_modes(self) -> list[str]:
        return MODES

    def get_group_modes(self) -> dict:
        return dict(self._group_modes)

    def reset_mode(self, jid: Optional[str] = None) -> None:
        with self._lock:
            if jid:
                self._group_modes.pop(jid, None)
            else:
                self.mode = DEFAULT_MODE
            self._save()

# ─── Instancia global ─────────────────────────────────────────────────────────
_engine: Optional[PersonalityEngine] = None

def get_engine() -> PersonalityEngine:
    global _engine
    if _engine is None:
        _engine = PersonalityEngine()
    return _engine

def generate_response(
    intent:     str,
    text:       str             = '',
    context:    dict            = {},
    jid:        str             = '',
    use_humor:  bool            = False,
    history:    list            = [],
    user_style: Optional[dict]  = None,
) -> str:
    return get_engine().generate_response(
        intent, text, context, jid, use_humor, history, user_style
    )

def set_mode(mode: str, jid: Optional[str] = None) -> bool:
    return get_engine().set_mode(mode, jid)

def get_mode(jid: Optional[str] = None) -> str:
    return get_engine().get_mode(jid)