import { createToggleCommand } from '@lib/groupToggles.js'

// No puede llamarse "hepein" — ya existe #hepein (selector de modo de personalidad).
export default createToggleCommand('hepein', 'modoia', ['iabot'])
