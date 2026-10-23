import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ChatView.module.css'

/** Render the decorative brand mark for the running Chat status. */
export function RunningWhaleTail() {
  return (
    <span className={css.runningIcon} aria-hidden="true">
      <FishLogo className={css.runningMark} size={14} />
    </span>
  )
}
