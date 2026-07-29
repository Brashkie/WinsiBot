import type { Command } from '../../../types/index.js'
import { sendRandomMeme } from '@lib/meme.js'

const MEME_JSON = 'https://raw.githubusercontent.com/Brashkie/module/refs/heads/main/public/random/meme.json'

const command: Command = {
  name: 'meme',
  aliases: ['memes', 'randommeme'],
  description: 'Envia un meme aleatorio',
  category: 'fun',
  cooldown: 5,

  async execute({ sock, jid, msg }) {
    await sendRandomMeme(sock, jid, msg, {
      url:            MEME_JSON,
      searchLabel:    'meme',
      notFoundPlural: 'memes',
      captionTitle:   'Meme aleatorio',
    })
  },
}

export default command
