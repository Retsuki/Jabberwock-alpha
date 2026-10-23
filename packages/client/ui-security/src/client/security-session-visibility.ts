/** Reserved task-session identities, including histories created before sidebar isolation. */
const taskSessionId = new RegExp('^security-(?:(?:planner|worker(?:-discussion)?)-)?'
  + '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'iu')

/** Keep ordinary conversations in navigation; task conversations have their own Sessions screen.
 * @param session Catalog identity allocated by the Session or security task owner.
 * @returns False only for reserved security task identities, independent of title or contents.
 */
export function showInMainSidebar(session: { id: string }): boolean {
  return !taskSessionId.test(session.id)
}
