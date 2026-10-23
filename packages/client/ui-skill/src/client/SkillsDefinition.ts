/** What the `skills` tab type is: a page that claims no address and offers one guide entry. */
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { IconSkillOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'

/** The tab kind this package owns. */
export const SKILLS_KIND = 'skills'

/** This implementation's identity in the tab system, and the key its body and title register under. */
export const SKILLS_ID = '@deepseek-ai/dsh-client-ui-skill'

/** The command that opens the Skills tab. */
export const SKILLS_COMMAND_ID = 'workspace.skills' as ShortcutCommandId

/**
 * The Skills type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function skillsDefinition(t: TranslateNS<'skill'>): SidebarRightTabDefinition {
  return {
    id: SKILLS_ID,
    kind: SKILLS_KIND,
    priority: 'builtin',
    title: () => t('tab.title'),
    guide: [{
      id: 'skills',
      commandId: SKILLS_COMMAND_ID,
      order: 40,
      title: () => t('tab.title'),
      description: () => t('tab.guide.description'),
      icon: IconSkillOutlineRegular,
    }],
  }
}
