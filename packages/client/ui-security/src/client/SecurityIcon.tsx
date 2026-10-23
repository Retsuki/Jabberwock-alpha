/** Shared application glyph for the security navigation entry. */
import { IconCheckCircleFillRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
/** Render the existing shared glyph at the sidebar's requested size.
 * @param props - navigation icon sizing.
 * @returns shared primitive artwork.
 */
export function SecurityIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>) {
  return <IconCheckCircleFillRegular size={size} />
}
