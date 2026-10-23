/** Permission grants belong to the primary application frame; microphone access also depends on the operating system. */
import { systemPreferences, type Session, type WebContents } from 'electron'

function applicationFrame(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'dsh-app:' && parsed.hostname === 'app'
  } catch (_error) { return false /* Invalid frame URLs cannot request permissions. */ }
}

/** Non-media permissions the primary application frame uses: `navigator.clipboard.writeText` for copy actions. */
const PRIMARY_FRAME_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write'])

/**
 * Grant permissions to the primary application window's main frame and deny every other request.
 * `media` admits one audio-only microphone request and, on macOS, follows the operating-system authorization;
 * any other permission is granted only when it is listed in `PRIMARY_FRAME_PERMISSIONS`.
 * Subframes, other web contents and foreign origins receive no permission.
 * @param session - application's browser session.
 * @param primary - current primary window contents, absent while no window is open.
 */
export function installMicrophonePermissions(session: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>, primary: () => WebContents | undefined): void {
  session.setPermissionCheckHandler((contents, permission, origin, details) => {
    const fromApplication = contents != null && contents === primary() && details.isMainFrame && applicationFrame(origin)
    if (permission !== 'media') return fromApplication && PRIMARY_FRAME_PERMISSIONS.has(permission)
    return fromApplication && details.mediaType === 'audio'
      && (process.platform !== 'darwin' || systemPreferences.getMediaAccessStatus('microphone') === 'granted')
  })
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const fromApplication = contents === primary() && details.isMainFrame && applicationFrame(details.requestingUrl)
    if (permission !== 'media') { callback(fromApplication && PRIMARY_FRAME_PERMISSIONS.has(permission)); return }
    const allowed = fromApplication
      && 'mediaTypes' in details && details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio'
    if (!allowed) { callback(false); return }
    if (process.platform !== 'darwin') { callback(true); return }
    void systemPreferences.askForMediaAccess('microphone').then(callback, () => { callback(false) })
  })
}
