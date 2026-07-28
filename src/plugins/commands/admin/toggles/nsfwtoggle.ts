import { createToggleCommand } from '@lib/groupToggles.js'

// No puede llamarse "nsfw" — ya existe un comando con ese nombre (imagen +18).
export default createToggleCommand('nsfw', 'activarnsfw', ['modohorny', 'caliente'])
