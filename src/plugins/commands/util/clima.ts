import type { Command } from '../../../types/index.js'
import axios from 'axios'

const command: Command = {
  name: 'clima',
  aliases: ['weather', 'tiempo'],
  description: 'Consulta el clima de una ciudad',
  category: 'util',

  async execute({ sock, jid, msg, args }) {
    const city = args.join(' ')
    if (!city) {
      await sock.sendMessage(jid, { text: '❌ Uso: !clima <ciudad>' }, { quoted: msg })
      return
    }

    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`
    const res = await axios.get(url)
    const d = res.data.current_condition[0]
    const area = res.data.nearest_area[0]

    const location = `${area.areaName[0].value}, ${area.country[0].value}`
    const temp = d.temp_C
    const feels = d.FeelsLikeC
    const humidity = d.humidity
    const desc = d.weatherDesc[0].value
    const wind = d.windspeedKmph

    const text = `🌤️ *Clima en ${location}*

🌡️ Temperatura: *${temp}°C* (sensación ${feels}°C)
💧 Humedad: ${humidity}%
💨 Viento: ${wind} km/h
☁️ Condición: ${desc}`

    await sock.sendMessage(jid, { text }, { quoted: msg })
  },
}

export default command