/** Session usage is a page type, opened from the compact overview. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { SidebarRightTabDefinition } from '../../tab-registry.ts'

/** Registry identity shared with the body registration. */
export const USAGE_ID = '@deepseek-ai/dsh-client-ui-sidebar-right/usage'
/** Page kind opened by the overview card. */
export const USAGE_KIND = 'usage'

/** @param t Sidebar copy. @returns The usage page without changing guide entries. */
export function usageDefinition(t: TranslateNS<'sidebarRight'>): SidebarRightTabDefinition {
  return { id: USAGE_ID, kind: USAGE_KIND, priority: 'builtin', title: () => t('summary.detailsTitle') }
}
