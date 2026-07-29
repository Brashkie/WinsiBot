import type { Command } from '../../../types/index.js'
import { sendRandomMeme } from '@lib/meme.js'

const MEME_PE_URL = 'https://raw.githubusercontent.com/Brashkie/module/refs/heads/main/public/random/meme_pe.json'

const command: Command = {
  name: 'memepe',
  aliases: ['mecausa', 'memeperu', 'memeperú'],
  description: 'Envia un meme peruano aleatorio',
  category: 'fun',
  cooldown: 5,

  async execute({ sock, jid, msg }) {
    await sendRandomMeme(sock, jid, msg, {
      url:            MEME_PE_URL,
      searchLabel:    'meme peruano',
      notFoundPlural: 'memes peruanos',
      captionTitle:   'Meme peruano',
      extraCaption:   '> ¡Me causa! 😂🇵🇪',
    })
  },
}

export default command
