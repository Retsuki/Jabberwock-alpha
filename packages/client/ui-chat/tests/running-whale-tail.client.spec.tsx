// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FISH_LOGO_PATH } from '@deepseek-ai/dsh-client-ui-primitives'
import { RunningWhaleTail } from '../src/client/chat/RunningWhaleTail.tsx'

afterEach(cleanup)

describe('RunningWhaleTail', () => {
  it('renders the shared decorative profile mark without raster assets or inline styles', () => {
    const view = render(<RunningWhaleTail />)
    const icon = view.container.firstElementChild!
    expect(icon.tagName).toBe('SPAN')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    const svg = icon.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 1024 1024')
    expect(svg.querySelectorAll('path')).toHaveLength(1)
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(FISH_LOGO_PATH)
    expect(svg.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
    expect(view.container.querySelector('image, img, animate, [style]')).toBeNull()
  })
})
