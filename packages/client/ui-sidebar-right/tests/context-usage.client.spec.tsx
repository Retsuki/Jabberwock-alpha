// @vitest-environment jsdom
/** Context and account quota remain distinct, including genuine zero measurements. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ContextRingProps } from '../src/client/shell/ContextRing.tsx'
import { ContextRing } from '../src/client/shell/ContextRing.tsx'
import { SessionSummary } from '../src/client/shell/SessionSummary.tsx'
import { summaryModel } from '../src/client/shell/summary-model.ts'
import { QuotaSummary } from '../src/client/tabs/usage/QuotaSummary.tsx'
import { ja } from '../src/client/locales.ts'

afterEach(cleanup)
const copy: Readonly<Record<string, string>> = ja
const t = (key: string): string => copy[key] ?? key
function projection(provider = 'claude-subscription', model = 'sonnet', used: number | null = 0): UseProjection {
  const values = {
    modelSelection: { next: { provider, model } },
    engineUsage: used === null ? null : { engine: 'claude', model: 'claude-sonnet-5', requestedModel: 'sonnet', updatedAt: 0,
      context: { usedTokens: used, maxTokens: 1000 }, tokens: { inputTokens: 0, outputTokens: 0 } },
  }
  return (key: keyof typeof values) => values[key]
}

describe('context display', () => {
  it('uses attributed aliases and measured zero for both panel and ring', () => {
    const useProjection = projection()
    expect(summaryModel(useProjection, t).percent).toBe(0)
    const openDetails = vi.fn()
    render(<ContextRing {...{ useProjection, t, openDetails } as ContextRingProps} />)
    const button = document.querySelector('button')!
    expect(button.textContent).toBe('0%')
    fireEvent.click(button)
    expect(openDetails).toHaveBeenCalledOnce()
  })
  it('renders the full context card before any usage exists', () => {
    const view = render(<SessionSummary useProjection={projection('claude-subscription', 'sonnet', null)} t={t} />)
    expect(view.container.textContent).toContain('コンテキスト')
    expect(view.container.textContent).toContain('—')
  })
  it('shows context as an open accordion which can be collapsed', () => {
    const view = render(<SessionSummary useProjection={projection()} t={t} />)
    const panel = view.container.querySelector('details')!
    expect(panel.open).toBe(true)
    fireEvent.click(panel.querySelector('summary')!)
    expect(panel.open).toBe(false)
    fireEvent.click(panel.querySelector('summary')!)
    expect(panel.open).toBe(true)
  })
  it('keeps token details collapsed until explicitly opened', () => {
    const view = render(<SessionSummary useProjection={projection()} t={t} />)
    const details = Array.from(view.container.querySelectorAll('details')).find(item => item.querySelector('summary')?.textContent === '直近のトークン使用量')!
    expect(details.open).toBe(false)
    const summary = details.querySelector('summary')!
    fireEvent.click(summary)
    expect(details.open).toBe(true)
    expect(details.textContent).toContain('入力0')
    fireEvent.click(summary)
    expect(details.open).toBe(false)
  })
  it('does not reuse context from a previous engine or newly selected model', () => {
    expect(summaryModel(projection('codex-subscription'), t).percent).toBeUndefined()
    expect(summaryModel(projection('claude-subscription', 'opus'), t).percent).toBeUndefined()
    render(<ContextRing {...{ useProjection: projection('claude-subscription', 'sonnet', null), t, openDetails: vi.fn() } as ContextRingProps} />)
    expect(document.querySelector('button')!.textContent).toBe('—')
  })
})

describe('account quota display', () => {
  it('renders reported windows, percentage zero, and millisecond reset date', () => {
    const resetsAt = new Date(2026, 9, 20, 1, 2).getTime()
    const useResource = (() => ({ status: 'live', failure: undefined, value: { engine: 'claude', status: 'ready', fetchedAt: 0,
      windows: [{ id: 'five_hour', label: '5h', usedPercent: 0, windowDurationMins: 300, resetsAt },
        { id: 'seven_day', label: '7d', usedPercent: null, windowDurationMins: 10080, resetsAt: null }] } })) as Parameters<typeof QuotaSummary>[0]['useResource']
    const view = render(<QuotaSummary engine="claude" t={t} useResource={useResource} />)
    expect(view.container.textContent).toContain('5時間0%')
    expect(view.container.textContent).toContain('100%')
    expect(view.container.textContent).toContain('週間—')
    expect(view.container.textContent).toContain(new Date(resetsAt).toLocaleString())
  })
  it('names Codex prefixed rolling windows without losing provider bucket identity', () => {
    const useResource = (() => ({ status: 'live', failure: undefined, value: { engine: 'codex', status: 'ready', fetchedAt: 0,
      windows: [{ id: 'codex:primary', label: 'codex', usedPercent: 12, windowDurationMins: 300, resetsAt: null },
        { id: 'codex:secondary', label: 'codex', usedPercent: 24, windowDurationMins: 10080, resetsAt: null },
        { id: 'model:1', label: 'Opus', usedPercent: 3, windowDurationMins: 10080, resetsAt: null }] } })) as Parameters<typeof QuotaSummary>[0]['useResource']
    const view = render(<QuotaSummary engine="codex" t={t} useResource={useResource} />)
    expect(view.container.textContent).toContain('codex · 5時間')
    expect(view.container.textContent).toContain('codex · 週間')
    expect(view.container.textContent).toContain('Opus · 週間')
  })
  it('refreshes explicitly and disables the button until the request completes', async () => {
    let finish = (): void => {}
    const refreshQuota = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const useResource = (() => ({ status: 'live', failure: undefined, value: { engine: 'claude', status: 'unavailable', fetchedAt: 0, windows: [] } })) as Parameters<typeof QuotaSummary>[0]['useResource']
    const view = render(<QuotaSummary engine="claude" t={t} useResource={useResource} refreshQuota={refreshQuota} />)
    const button = view.getByRole('button') as HTMLButtonElement
    fireEvent.click(button)
    expect(refreshQuota).toHaveBeenCalledWith('claude')
    expect(button.disabled).toBe(true)
    await act(async () => { finish() })
    expect(button.disabled).toBe(false)
  })
  it('never shows a previous provider snapshot as the selected account', () => {
    const useResource = (() => ({ status: 'live', failure: undefined, value: { engine: 'claude', status: 'ready', fetchedAt: 0,
      windows: [{ id: 'five_hour', label: '5h', usedPercent: 42, windowDurationMins: 300, resetsAt: null }] } })) as Parameters<typeof QuotaSummary>[0]['useResource']
    const view = render(<QuotaSummary engine="codex" t={t} useResource={useResource} />)
    expect(view.container.textContent).toContain('取得できません')
    expect(view.container.textContent).not.toContain('42%')
  })
})
