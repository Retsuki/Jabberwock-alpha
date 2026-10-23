/** Poll ownership belongs to the resource stream, not to a business component. */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SubscriptionQuotaSnapshot } from '@deepseek-ai/dsh-subscription-engines/quota'

type Engine = 'claude' | 'codex'
/** One stream per held provider; manual refresh wakes that stream without a second cache.
 * @param read Provider-bound authenticated quota read.
 * @returns Resource stream and manual refresh actions.
 */
export function createQuotaResource(read: (engine: Engine) => Promise<RemoteResult<SubscriptionQuotaSnapshot>>): {
  refresh: (engine: Engine) => Promise<void>
  open: (address: string, options: { signal: AbortSignal }) => AsyncGenerator<RemoteResult<SubscriptionQuotaSnapshot>>
} {
  const active = new Map<Engine, { wake: () => void; pending: Set<() => void> }>()
  return {
    refresh(engine: Engine): Promise<void> {
      const stream = active.get(engine)
      if (stream === undefined) return Promise.resolve()
      return new Promise((resolve) => { stream.pending.add(resolve); stream.wake() })
    },
    async *open(address: string, { signal }: { signal: AbortSignal }): AsyncGenerator<RemoteResult<SubscriptionQuotaSnapshot>> {
      const engine = new URL(address).pathname.slice(1)
      if (engine !== 'claude' && engine !== 'codex') return
      const cancelled = (): boolean => signal.aborted
      const stream = { wake: (): void => {}, pending: new Set<() => void>() }
      active.set(engine, stream)
      try {
        while (!cancelled()) {
          const result = await read(engine)
          if (cancelled()) return
          for (const resolve of stream.pending) resolve()
          stream.pending.clear()
          yield result
          await new Promise<void>((resolve) => {
            const done = (): void => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
            const timer = setTimeout(done, 30_000)
            stream.wake = done
            signal.addEventListener('abort', done, { once: true })
            if (cancelled()) done()
          })
        }
      } finally {
        if (active.get(engine) === stream) active.delete(engine)
        for (const resolve of stream.pending) resolve()
      }
    },
  }
}
