// Las descripciones de los comandos en inglés y portugués, para el menú y
// #categoria. La de cada comando en español sigue en su archivo (`description`);
// acá van solo las traducciones, para no tocar 221 archivos y para que el que
// traduzca tenga todo junto.
//
// Están todos. Uno nuevo sin traducción sale en español (y un test avisa).
// Los subcomandos (`entrar`, `pedir`, `atacar`…) no se traducen: son lo que
// hay que escribir.
//
// Este archivo solo lo importan el menú y #categoria, que se cargan la primera
// vez que alguien los usa: las ~220 descripciones no ocupan RAM hasta entonces.

import type { Idioma } from './i18n.js'

type Traduccion = Partial<Record<Exclude<Idioma, 'es'>, string>>

const D: Record<string, Traduccion> = {
  // general
  birthday:   { en: 'Birthdays  |  !birthday set DD/MM  ·  !birthday list  ·  !cumples (the upcoming ones)  ·  !birthday borrar', pt: 'Aniversários  |  !birthday set DD/MM  ·  !birthday list  ·  !cumples (os próximos)  ·  !birthday borrar' },
  afk:        { en: 'Turn on AFK mode with a reason', pt: 'Ativa o modo AFK com um motivo' },
  categoria:  { en: 'Shows the commands of one category', pt: 'Mostra os comandos de uma categoria' },
  login:      { en: 'Link your web panel session — type the code the website showed you', pt: 'Vincula sua sessão do painel web — digite o código que o site mostrou' },
  menu:       { en: 'Shows every available command', pt: 'Mostra todos os comandos disponíveis' },
  ping:       { en: 'Checks that the bot is up', pt: 'Verifica se o bot está ativo' },
  idioma:     { en: 'Change the language the bot uses with you (es, en, pt)', pt: 'Muda o idioma que o bot usa com você (es, en, pt)' },

  // rpg
  transfer:   { en: 'Transfer resources to another user', pt: 'Transfere recursos para outro usuário' },
  rw:         { en: 'Rolls a random character', pt: 'Sorteia um personagem aleatório' },
  blackjack:  { en: 'Blackjack against the dealer  |  !bj <amount>  ·  !bj pedir | plantarse | doblar', pt: 'Blackjack contra o crupiê  |  !bj <valor>  ·  !bj pedir | plantarse | doblar' },
  poker:      { en: 'Casino Hold\'em against the house  |  !poker <ante>  ·  !poker ir  ·  !poker retirarse', pt: 'Casino Hold\'em contra a casa  |  !poker <ante>  ·  !poker ir  ·  !poker retirarse' },
  arena:      { en: 'PvP arena with ELO and divisions', pt: 'Arena PvP com ELO e divisões' },
  subasta:    { en: 'Auction dragons and items in the group  |  !subasta  ·  !subasta vender …  ·  !pujar <amount>', pt: 'Leilão de dragões e itens no grupo  |  !subasta  ·  !subasta vender …  ·  !pujar <valor>' },
  avatar:     { en: 'Create, equip and show your RPG avatar', pt: 'Crie, equipe e mostre seu avatar de RPG' },
  bal:        { en: 'See your balance', pt: 'Veja seu saldo' },
  baltop:     { en: 'Richest users in the group  |  !baltop [page]', pt: 'Usuários mais ricos do grupo  |  !baltop [página]' },
  depositar:  { en: 'Deposit or withdraw BrasCoins from the bank', pt: 'Deposita ou saca BrasCoins do banco' },
  business:   { en: 'Buy businesses that earn passive BrasCoins — !business [comprar <id>]', pt: 'Compre negócios que geram BrasCoins passivos — !business [comprar <id>]' },
  chest:      { en: 'Open the daily chest — once a day, resets at midnight', pt: 'Abre o baú diário — uma vez por dia, reinicia à meia-noite' },
  c:          { en: 'Claim the active character by replying to its message', pt: 'Reivindica o personagem ativo respondendo à mensagem dele' },
  clan:       { en: 'Full clan system with wars, territories and alliances', pt: 'Sistema completo de clãs com guerras, territórios e alianças' },
  coinflip:   { en: 'Flip a coin  |  !cf [cara|cruz] <amount>', pt: 'Cara ou coroa  |  !cf [cara|cruz] <valor>' },
  collect:    { en: 'Collect the passive income from your businesses', pt: 'Coleta a renda passiva dos seus negócios' },
  aceptar:    { en: 'Accept a relationship proposal (@mention who proposed)', pt: 'Aceita um pedido de namoro (@mencione quem pediu)' },
  terminar:   { en: 'End your relationship or cancel a pending proposal', pt: 'Termina seu relacionamento ou cancela um pedido pendente' },
  rechazar:   { en: 'Reject a relationship proposal (@mention who proposed)', pt: 'Recusa um pedido de namoro (@mencione quem pediu)' },
  mipareja:   { en: 'See your current relationship', pt: 'Veja seu relacionamento atual' },
  pareja:     { en: 'Propose to someone, or show a random couple from the group', pt: 'Peça alguém em namoro, ou mostra um casal aleatório do grupo' },
  crime:      { en: 'Commit a crime — win or lose (15 min cooldown)', pt: 'Cometa um crime — ganhe ou perca (15 min de espera)' },
  daily:      { en: 'Claim your reward once a day — resets at midnight, grows with your streak', pt: 'Pegue sua recompensa uma vez por dia — reinicia à meia-noite, cresce com sua sequência' },
  mazmorra:   { en: 'Today\'s dungeon, the same for every group  |  !mazmorra entrar · !mazmorra <door> · !mazmorra salir · !mazmorra ranking', pt: 'A masmorra do dia, a mesma para todos os grupos  |  !mazmorra entrar · !mazmorra <porta> · !mazmorra salir · !mazmorra ranking' },
  einfo:      { en: 'See the cooldowns of your economy commands', pt: 'Veja os tempos de espera dos seus comandos de economia' },
  ascuas:     { en: 'Search for BrasEmbers in old campfires — long cooldown, you don\'t always find some', pt: 'Procure BrasEmbers em fogueiras — espera longa, nem sempre se acha algo' },
  forjar:     { en: 'Upgrade your weapon from +0 to +10 (damage in #raid)  |  !forjar  ·  !forjar mejorar  ·  !forjar proteccion', pt: 'Melhore sua arma de +0 a +10 (dano no #raid)  |  !forjar  ·  !forjar mejorar  ·  !forjar proteccion' },
  regalo:     { en: 'Send gifts between users', pt: 'Presentes entre usuários' },
  ginfo:      { en: 'Global Roll Waifu stats + your cooldowns', pt: 'Estatísticas globais do Roll Waifu + seus tempos de espera' },
  harem:      { en: 'See the characters claimed with #rw  |  !harem [@user] [page]', pt: 'Veja os personagens reivindicados com #rw  |  !harem [@usuário] [página]' },
  salud:      { en: 'Your health, and healing  |  !salud  ·  !curar (a potion)  ·  !hospital (paying)', pt: 'Sua saúde, e se curar  |  !salud  ·  !curar (uma poção)  ·  !hospital (pagando)' },
  invertir:   { en: 'Bet on whether an asset goes up or down  |  !invertir btc 100 sube 1m', pt: 'Aposte se um ativo sobe ou desce  |  !invertir btc 100 sube 1m' },
  rangos:     { en: 'Rank table', pt: 'Tabela de patentes' },
  leveltop:   { en: 'Highest level users in the group  |  !leveltop [page]', pt: 'Usuários de maior nível do grupo  |  !leveltop [página]' },
  mercado:    { en: 'Virtual market panel — live prices', pt: 'Painel do mercado virtual — preços em tempo real' },
  mine:       { en: 'Mine resources every 10 minutes', pt: 'Minere recursos a cada 10 minutos' },
  monthly:    { en: 'Monthly reward — every 5 days', pt: 'Recompensa mensal — a cada 5 dias' },
  pay:        { en: 'Send BrasCoins to another user  |  !pay 1000 @user', pt: 'Envia BrasCoins para outro usuário  |  !pay 1000 @usuário' },
  pet:        { en: 'Dragons (Dragon City)  |  !pet <subcommand>', pt: 'Dragões (Dragon City)  |  !pet <subcomando>' },
  prestige:   { en: 'Prestige, medals and XP multipliers', pt: 'Prestígio, medalhas e multiplicadores de XP' },
  perfil:     { en: 'See your profile or someone else\'s (@mention or reply to them)', pt: 'Veja seu perfil ou o de outra pessoa (@mencione ou responda a ela)' },
  cotizacion: { en: 'Price chart  |  buy/sell assets  |  portfolio', pt: 'Gráfico de preço  |  comprar/vender ativos  |  portfólio' },
  raid:       { en: 'World boss: every group against the same one  |  !raid  ·  !raid atacar  ·  !raid on/off', pt: 'Chefe mundial: todos os grupos contra o mesmo  |  !raid  ·  !raid atacar  ·  !raid on/off' },
  rob:        { en: 'Steal BrasCoins from someone (@mention)', pt: 'Rouba BrasCoins de alguém (@mencione)' },
  roulette:   { en: 'Bet on the roulette  |  !rt <red|black|0-36> <amount>', pt: 'Aposte na roleta  |  !rt <red|black|0-36> <valor>' },
  slut:       { en: 'Use your charms to earn BrasCoins +18 (10 min cooldown)', pt: 'Use seu charme para ganhar BrasCoins +18 (10 min de espera)' },
  weekly:     { en: 'Weekly reward — every 3 days', pt: 'Recompensa semanal — a cada 3 dias' },
  wimage:     { en: 'Character image  |  !wi random  |  !wi <name>', pt: 'Imagem de personagem  |  !wi random  |  !wi <nome>' },
  winfo:      { en: 'Shows a character\'s info', pt: 'Mostra as informações de um personagem' },
  work:       { en: 'Work every 10 minutes to earn BrasCoins', pt: 'Trabalhe a cada 10 minutos para ganhar BrasCoins' },
  xp:         { en: 'See your RPG stats', pt: 'Veja suas estatísticas de RPG' },

  // roleplay
  cry:        { en: 'Cry (or make someone cry)', pt: 'Chora (ou faz alguém chorar)' },
  hug:        { en: 'Hug someone', pt: 'Abraça alguém' },
  kill:       { en: 'Kill someone', pt: 'Mata alguém' },
  kiss:       { en: 'Kiss someone', pt: 'Beija alguém' },
  kisscheeks: { en: 'Kiss someone on the cheek', pt: 'Beija a bochecha de alguém' },
  laugh:      { en: 'Laugh (or laugh at someone)', pt: 'Ri (ou ri de alguém)' },
  pat:        { en: 'Pat someone', pt: 'Faz carinho em alguém' },
  punch:      { en: 'Punch someone', pt: 'Dá um soco em alguém' },
  sad:        { en: 'Look sad (or make someone sad)', pt: 'Fica triste (ou deixa alguém triste)' },
  slap:       { en: 'Slap someone', pt: 'Dá um tapa em alguém' },
  sleep:      { en: 'Fall asleep (or put someone to sleep)', pt: 'Pega no sono (ou faz alguém dormir)' },

  // jadibot
  serbot:      { en: 'Become a sub-bot  |  lista/setname/setmedia', pt: 'Vire um sub-bot  |  lista/setname/setmedia' },
  bots:        { en: 'Summary of the active sub-bots by category', pt: 'Resumo dos sub-bots ativos por categoria' },
  stopbot:     { en: 'Disconnect yourself as a sub-bot', pt: 'Desconecta você como sub-bot' },

  // ai
  gpt:         { en: 'Chat with GPT-4 | !gptreset to clear the history', pt: 'Converse com o GPT-4 | !gptreset para apagar o histórico' },
  imagine:     { en: 'Generate an image with DALL-E 3', pt: 'Gera uma imagem com DALL-E 3' },
  imitar:      { en: 'Hepein talks imitating the style of a group member', pt: 'O Hepein fala imitando o estilo de alguém do grupo' },
  miestilo:    { en: 'See the style profile Hepein learned from you', pt: 'Veja o perfil de estilo que o Hepein aprendeu de você' },
  estilode:    { en: 'See another user\'s style profile', pt: 'Veja o perfil de estilo de outro usuário' },
  olvidar:     { en: 'Delete your Hepein profile (privacy)', pt: 'Apaga seu perfil do Hepein (privacidade)' },
  hepeinstats: { en: 'Learning pipeline stats', pt: 'Estatísticas do aprendizado' },
  traducir:    { en: 'Translate text to any language', pt: 'Traduz texto para qualquer idioma' },

  // admin
  antilink:    { en: 'Turn antilink on/off in the group', pt: 'Liga/desliga o antilink no grupo' },
  ban:         { en: 'Ban a user from the bot', pt: 'Bane um usuário do bot' },
  banchat:     { en: 'Mute/unmute the bot in this group', pt: 'Silencia/ativa o bot neste grupo' },
  on:          { en: 'Turn group features on or off', pt: 'Liga ou desliga funções do grupo' },
  delete:      { en: 'Delete the quoted message', pt: 'Apaga a mensagem citada' },
  demote:      { en: 'Remove a member\'s admin role', pt: 'Tira o cargo de administrador de um membro' },
  fantasmas:   { en: 'Members who didn\'t write in N days  |  !fantasmas [days]  ·  !fantasmas sacar [days]', pt: 'Membros que não escreveram em N dias  |  !fantasmas [dias]  ·  !fantasmas sacar [dias]' },
  grupo:       { en: 'Open or close the group (closed: only admins write)  |  !cerrar  ·  !abrir', pt: 'Abre ou fecha o grupo (fechado: só os admins escrevem)  |  !cerrar  ·  !abrir' },
  groupinfo:   { en: 'Group info + your profile in the group', pt: 'Info do grupo + seu perfil no grupo' },
  kick:        { en: 'Remove a user from the group', pt: 'Remove um usuário do grupo' },
  mute:        { en: 'Turn mute on/off in the group', pt: 'Liga/desliga o mudo no grupo' },
  promote:     { en: 'Give a member the admin role  |  !promote @user', pt: 'Dá o cargo de administrador a um membro  |  !promote @usuário' },
  stats:       { en: 'Bot statistics', pt: 'Estatísticas do bot' },
  tag:         { en: 'Mention every group member', pt: 'Menciona todos os membros do grupo' },
  tagone:      { en: 'Mention one specific person', pt: 'Menciona uma pessoa específica' },
  warn:        { en: 'Warn a user', pt: 'Adverte um usuário' },
  hepein:      { en: 'Control the bot\'s personality', pt: 'Controla a personalidade do bot' },

  // downloader / scraper
  apk:         { en: 'Search and download APKs from Aptoide', pt: 'Busca e baixa APKs do Aptoide' },
  downloadapk: { en: 'Download an APK from a direct URL', pt: 'Baixa um APK de uma URL direta' },
  tiktok:      { en: 'Download a TikTok video without watermark', pt: 'Baixa vídeo do TikTok sem marca d\'água' },
  ttsearch:    { en: 'Search TikTok videos and show a carousel to download', pt: 'Busca vídeos no TikTok e mostra um carrossel para baixar' },
  ytmp3:       { en: 'Download audio from YouTube', pt: 'Baixa áudio do YouTube' },
  ytmp4:       { en: 'Download video from YouTube', pt: 'Baixa vídeo do YouTube' },
  ig:          { en: 'Download an Instagram photo/video', pt: 'Baixa foto/vídeo do Instagram' },
  pinterest:   { en: 'Search images on Pinterest', pt: 'Busca imagens no Pinterest' },

  // info
  creator:     { en: 'About the bot and its creator', pt: 'Sobre o bot e o criador' },
  infobot:     { en: 'The bot\'s ID card — version, status and features', pt: 'A identidade do bot — versão, estado e recursos' },
  mcuuid:      { en: 'Get the UUID of a Minecraft Java player', pt: 'Pega o UUID de um jogador de Minecraft Java' },
  mcavatar:    { en: 'Show a Minecraft Java player\'s avatar', pt: 'Mostra o avatar de um jogador de Minecraft Java' },
  mchead:      { en: 'Show a Minecraft Java player\'s head', pt: 'Mostra a cabeça de um jogador de Minecraft Java' },
  mcbody:      { en: 'Show a Minecraft Java player\'s body', pt: 'Mostra o corpo de um jogador de Minecraft Java' },
  mcskin:      { en: 'Download a Minecraft Java player\'s skin', pt: 'Baixa a skin de um jogador de Minecraft Java' },
  roblox:      { en: 'Look up a Roblox user by name or ID', pt: 'Busca um usuário do Roblox por nome ou ID' },
  mcsearch:    { en: 'Look up an Xbox Live profile by Gamertag', pt: 'Busca um perfil da Xbox Live pela Gamertag' },
  mcfriends:   { en: 'Show a player\'s Xbox Live friends (carousel)', pt: 'Mostra os amigos da Xbox Live de um jogador (carrossel)' },
  mcachievement: { en: 'Show a player\'s Xbox Live achievements', pt: 'Mostra as conquistas da Xbox Live de um jogador' },

  // media
  anime:       { en: 'Upscale an image with Anime4K (x2 or x4) — keeps the style, use #toanime for that', pt: 'Aumenta a resolução de uma imagem com Anime4K (x2 ou x4) — não muda o estilo, use #toanime para isso' },
  lego:        { en: 'Turn an image into a LEGO-style mosaic', pt: 'Transforma uma imagem num mosaico estilo LEGO' },
  removebg:    { en: 'Remove an image\'s background', pt: 'Remove o fundo de uma imagem' },
  toanime:     { en: 'Turn a real photo into anime style (AnimeGANv2)', pt: 'Transforma uma foto real em estilo anime (AnimeGANv2)' },

  // fun
  banana:      { en: 'Measures it with real odds lol', pt: 'Mede com probabilidades reais kkk' },
  parejas:     { en: 'Random couples from the group  |  !parejas [amount]', pt: 'Casais aleatórios do grupo  |  !parejas [quantidade]' },
  reto:        { en: 'Random dare to play in the group', pt: 'Desafio aleatório para jogar no grupo' },
  giphy:       { en: 'Search a GIF on GIPHY', pt: 'Busca um GIF no GIPHY' },
  adivinar:    { en: 'Group word-guessing game', pt: 'Jogo de adivinhar palavras em grupo' },
  insultar:    { en: 'Insult someone creatively', pt: 'Insulta alguém de forma criativa' },
  asesino:     { en: 'Killer in the chat (Mafia-style), 4 to 10 players  |  !asesino crear · unirme · empezar · votar <n>', pt: 'Assassino no chat (estilo Máfia), de 4 a 10 jogadores  |  !asesino crear · unirme · empezar · votar <n>' },
  follar:      { en: '+18 command', pt: 'Comando adulto (+18)' },
  lista:       { en: 'Team match lineups (4vs4 to 24vs24)  |  !lista 4vs4 [title]  ·  !lista unirme  ·  !mapa', pt: 'Listas de partidas por times (4vs4 a 24vs24)  |  !lista 4vs4 [título]  ·  !lista unirme  ·  !mapa' },
  melones:     { en: 'Measures them with real odds lol', pt: 'Mede com probabilidades reais kkk' },
  meme:        { en: 'Send a random meme', pt: 'Manda um meme aleatório' },
  memepe:      { en: 'Send a random Peruvian meme', pt: 'Manda um meme peruano aleatório' },
  quiz:        { en: 'Programming quiz with ELO', pt: 'Quiz de programação com ELO' },
  sega:        { en: 'Funny animation', pt: 'Animação engraçada' },
  ship:        { en: 'Compatibility between two people  |  !ship @one @other  ·  !ship @someone', pt: 'A compatibilidade entre duas pessoas  |  !ship @um @outro  ·  !ship @alguém' },
  historia:    { en: 'Broken telephone: a story in turns, each one sees only the last piece  |  !historia nueva <first sentence>', pt: 'Telefone sem fio: uma história em turnos, cada um vê só o último pedaço  |  !historia nueva <primeira frase>' },
  sus:         { en: 'Accuse someone of being the impostor', pt: 'Acusa alguém de ser o impostor' },
  top:         { en: 'Random top 10 with the group members', pt: 'Top 10 aleatório com os membros do grupo' },
  trade:       { en: 'Trade characters with another user', pt: 'Troca personagens com outro usuário' },
  verdad:      { en: 'Random question to play Truth or Dare', pt: 'Pergunta aleatória para jogar Verdade ou Desafio' },
  tweet:       { en: 'Make a fake tweet image with your text (and photo if you attach one)', pt: 'Gera uma imagem de tweet falso com seu texto (e foto se anexar)' },

  // music
  applemusic:  { en: 'Search a song on Apple Music', pt: 'Busca uma música no Apple Music' },
  deezer:      { en: 'Search a song on Deezer', pt: 'Busca uma música no Deezer' },
  spotify:     { en: 'Look up a song on Spotify', pt: 'Busca info de uma música no Spotify' },

  // nsfw
  porn:        { en: 'Adult video — needs nsfw on', pt: 'Vídeo adulto — precisa do nsfw ativado' },
  rule34:      { en: 'Search an image on Rule34 — needs nsfw on', pt: 'Busca uma imagem no Rule34 — precisa do nsfw ativado' },
  rule34video: { en: 'Search a video on Rule34Video — needs nsfw on', pt: 'Busca um vídeo no Rule34Video — precisa do nsfw ativado' },
  sexyimg:     { en: 'Random +18 image — needs nsfw on', pt: 'Imagem +18 aleatória — precisa do nsfw ativado' },
  stickerporn: { en: 'Random +18 sticker — needs nsfw on', pt: 'Figurinha +18 aleatória — precisa do nsfw ativado' },

  // owner
  backup:      { en: 'Send the session (creds.json) to your DM', pt: 'Envia a sessão (creds.json) no privado' },
  block:       { en: 'Block or unblock a number', pt: 'Bloqueia ou desbloqueia um número' },
  boost:       { en: 'Reset caches and show the bot status', pt: 'Reinicia os caches e mostra o estado do bot' },
  bc:          { en: 'Send a message to every chat', pt: 'Envia uma mensagem para todos os chats' },
  canalid:     { en: 'Show the current newsletter channel ID', pt: 'Mostra o ID do canal atual' },
  clearsession: { en: 'Delete session files except creds.json', pt: 'Apaga os arquivos de sessão menos o creds.json' },
  cleartmp:    { en: 'Clear temporary files', pt: 'Limpa os arquivos temporários' },
  addcoins:    { en: 'Add or remove coins from a user', pt: 'Adiciona ou tira moedas de um usuário' },
  creategroup: { en: 'Create a new group', pt: 'Cria um grupo novo' },
  adddiamonds: { en: 'Add or remove diamonds from a user', pt: 'Adiciona ou tira diamantes de um usuário' },
  exec:        { en: 'Run JavaScript inside the bot', pt: 'Executa JavaScript dentro do bot' },
  addexp:      { en: 'Add or remove EXP from a user', pt: 'Adiciona ou tira EXP de um usuário' },
  fetch:       { en: 'Get the content of a URL', pt: 'Pega o conteúdo de uma URL' },
  join:        { en: 'Join the bot to a group by invite link', pt: 'Coloca o bot num grupo pelo link de convite' },
  leave:       { en: 'Make the bot leave this group or one by ID', pt: 'Faz o bot sair deste grupo ou de um pelo ID' },
  addowner:    { en: 'Add or remove an owner (runtime)', pt: 'Adiciona ou remove um dono (em execução)' },
  addpremium:  { en: 'Add or remove premium from a user', pt: 'Adiciona ou tira o premium de um usuário' },
  resetuser:   { en: 'Reset all of a user\'s data', pt: 'Reinicia todos os dados de um usuário' },
  restart:     { en: 'Restart the bot (needs PM2 or nodemon)', pt: 'Reinicia o bot (precisa de PM2 ou nodemon)' },
  setbio:      { en: 'Change the bot\'s WhatsApp bio/status', pt: 'Muda o recado do bot no WhatsApp' },
  setname:     { en: 'Change the bot\'s WhatsApp name', pt: 'Muda o nome do bot no WhatsApp' },
  setpp:       { en: 'Change the bot\'s profile picture', pt: 'Muda a foto de perfil do bot' },
  settier:     { en: 'Set a user\'s account tier (free/vip/premium/pro/promax)', pt: 'Define o nível de conta de um usuário (free/vip/premium/pro/promax)' },
  sysinfo:     { en: 'System info and service status', pt: 'Informações do sistema e estado dos serviços' },
  terminal:    { en: 'Run a command in the server terminal', pt: 'Executa um comando no terminal do servidor' },
  unban:       { en: 'Unban a user from the database', pt: 'Desbane um usuário do banco de dados' },

  // sticker
  delsticker:  { en: 'Delete a sticker from your saved collection', pt: 'Apaga uma figurinha da sua coleção' },
  qc:          { en: 'Turn a message into a sticker  |  reply to a message with !qc  ·  !qc <text>', pt: 'Transforma uma mensagem em figurinha  |  responda a uma mensagem com !qc  ·  !qc <texto>' },
  savesticker: { en: 'Save a sticker to your personal collection — reply to a sticker with this command', pt: 'Guarda uma figurinha na sua coleção — responda a uma figurinha com este comando' },
  sticker:     { en: 'Turn an image/video into a sticker  |  !sticker [pack | author]  ·  quoting a sticker, changes its pack and author', pt: 'Transforma imagem/vídeo em figurinha  |  !sticker [pack | autor]  ·  citando uma figurinha, muda pack e autor' },
  stickerpack: { en: 'Download a sticker pack from getstickerpack.com', pt: 'Baixa um pacote de figurinhas do getstickerpack.com' },
  stickers:    { en: 'List or search your saved stickers — #stickers <name> resends the match', pt: 'Lista ou busca suas figurinhas — #stickers <nome> reenvia a que bater' },
  texto:       { en: 'A sticker with your text in big letters  |  !texto <text>', pt: 'Uma figurinha com seu texto em letras grandes  |  !texto <texto>' },

  // util
  calc:        { en: 'Scientific calculator with expressions and statistics', pt: 'Calculadora científica com expressões e estatísticas' },
  convertir:   { en: 'Convert between units (length, weight, temperature, data…)', pt: 'Converte entre unidades (comprimento, peso, temperatura, dados…)' },
  actividad:   { en: 'Who writes the most in the group  |  !actividad [days]', pt: 'Quem mais escreve no grupo  |  !actividad [dias]' },
  paises:      { en: 'Which countries the group members are from', pt: 'De que países são os membros do grupo' },
  sorteo:      { en: 'Giveaways in the group  |  !sorteo crear 30m <prize> [x2]  ·  !sorteo unirme  ·  !sorteo rapido <prize>', pt: 'Sorteios no grupo  |  !sorteo crear 30m <prêmio> [x2]  ·  !sorteo unirme  ·  !sorteo rapido <prêmio>' },
  imagen:      { en: 'Search an image on the internet', pt: 'Busca uma imagem na internet' },
  nota:        { en: 'Group notes (rules, payments, schedules…)  |  !nota <name>  ·  !nota set <name> <text>  ·  !reglas', pt: 'Notas do grupo (regras, pagamentos, horários…)  |  !nota <nome>  ·  !nota set <nome> <texto>  ·  !reglas' },
  encuesta:    { en: 'Create a poll  |  !encuesta question | option 1 | option 2  (-m for multiple votes)', pt: 'Cria uma enquete  |  !encuesta pergunta | opção 1 | opção 2  (-m para voto múltiplo)' },
  recordar:    { en: 'Reminds you of something  |  !recordar 10m take out the laundry  |  !recordar lista  |  !recordar borrar <n>', pt: 'Te lembra de algo  |  !recordar 10m tirar a roupa  |  !recordar lista  |  !recordar borrar <n>' },
  resumen:     { en: 'What did I miss? Summarizes the group chat  |  !resumen [hours]', pt: 'O que eu perdi? Resume a conversa do grupo  |  !resumen [horas]' },
  tts:         { en: 'Turn text into a voice note, offline  |  !tts <text> (max 400)  ·  or reply to a message', pt: 'Transforma texto em áudio, sem internet  |  !tts <texto> (máx 400)  ·  ou responda a uma mensagem' },
  clima:       { en: 'Check a city\'s weather', pt: 'Consulta o clima de uma cidade' },
  modoadmin:   { en: 'Turn admin-only mode on/off in the group', pt: 'Liga/desliga o modo só-admins no grupo' },

  // lote E (de los comandos de nekos.club)
  take:         { en: 'Put your pack and author on a sticker, quoting it  |  !take [pack | author]', pt: 'Põe seu pack e autor numa figurinha, citando  |  !take [pack | autor]' },
  setmeta:      { en: 'The pack and author of your stickers  |  !setmeta My pack | Me', pt: 'O pack e o autor das suas figurinhas  |  !setmeta Meu pack | Eu' },
  delmeta:      { en: 'Your stickers go back to the bot\'s pack and author', pt: 'Suas figurinhas voltam ao pack e autor do bot' },
  newpack:      { en: 'Create a sticker pack  |  !newpack <name>', pt: 'Cria um pacote de figurinhas  |  !newpack <nome>' },
  stickeradd:   { en: 'Add a sticker to a pack, quoting it  |  !stickeradd <pack>', pt: 'Adiciona uma figurinha a um pacote, citando  |  !stickeradd <pacote>' },
  stickerdel:   { en: 'Remove a sticker from a pack  |  !stickerdel <pack> <number>', pt: 'Tira uma figurinha de um pacote  |  !stickerdel <pacote> <número>' },
  stickerpacks: { en: 'Your sticker packs', pt: 'Seus pacotes de figurinhas' },
  getpack:      { en: 'Send the stickers of one of your packs  |  !getpack <pack>', pt: 'Manda as figurinhas de um dos seus pacotes  |  !getpack <pacote>' },
  delpack:      { en: 'Delete a pack and its stickers  |  !delpack <pack>', pt: 'Apaga um pacote e suas figurinhas  |  !delpack <pacote>' },
  toimg:        { en: 'A sticker back to an image (or a video, if animated), quoting it', pt: 'Uma figurinha de volta a imagem (ou vídeo, se animada), citando' },
  setdesc:      { en: 'Your profile description  |  !setdesc <text>', pt: 'Sua descrição no perfil  |  !setdesc <texto>' },
  deldesc:      { en: 'Delete your profile description', pt: 'Apaga sua descrição do perfil' },
  setgenre:     { en: 'Your gender on the profile  |  !setgenre hombre | mujer | otro', pt: 'Seu gênero no perfil  |  !setgenre hombre | mujer | otro' },
  delgenre:     { en: 'Remove your gender from the profile', pt: 'Tira seu gênero do perfil' },
  getpic:       { en: 'Someone\'s profile picture  |  !getpic @someone (or quoting their message)', pt: 'A foto de perfil de alguém  |  !getpic @alguém (ou citando a mensagem)' },
  suggest:      { en: 'Send a suggestion or a bug report to the bot owner  |  !suggest <text>', pt: 'Manda uma sugestão ou um erro para o dono do bot  |  !suggest <texto>' },
  setwelcome:   { en: 'The group\'s welcome text  |  !setwelcome Hi @user, welcome to @group', pt: 'O texto de boas-vindas do grupo  |  !setwelcome Oi @user, bem-vind@ ao @group' },
  setbye:       { en: 'The group\'s goodbye text  |  !setbye Bye @user', pt: 'O texto de despedida do grupo  |  !setbye Tchau @user' },
  delwelcome:   { en: 'Back to the default welcome and goodbye', pt: 'Volta às boas-vindas e despedida de sempre' },
  testwelcome:  { en: 'Shows the welcome (or the goodbye, with #testbye) as if you had joined', pt: 'Mostra as boas-vindas (ou a despedida, com #testbye) como se você entrasse' },
}

/** La descripción de un comando en `idioma`, o la suya en español. */
export function descripcion(cmd: { name: string; description: string }, idioma: Idioma): string {
  if (idioma === 'es') return cmd.description
  const propia = D[cmd.name]?.[idioma]
  if (propia) return propia
  // Los 28 interruptores del grupo (antibot, welcome…) dicen todos lo mismo.
  const llave = /^Activa\/desactiva (\S+) en el grupo$/.exec(cmd.description)
  if (llave) return idioma === 'en' ? `Turn ${llave[1]} on/off in the group` : `Liga/desliga o ${llave[1]} no grupo`
  return cmd.description
}

/** Cuántos comandos tienen traducción, para los tests. */
export const traducidos = () => Object.keys(D)
