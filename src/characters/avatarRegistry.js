// Avatar registry: id -> avatar record.
// AvatarSlot components register here on mount so the Director and
// VoiceEngine can reach them without prop drilling.
const avatars = {}

export function registerAvatar(id, rec) { avatars[id] = rec }
export function unregisterAvatar(id) { delete avatars[id] }
export function getAvatar(id) { return avatars[id] || null }
export function getAvatars() { return avatars }
