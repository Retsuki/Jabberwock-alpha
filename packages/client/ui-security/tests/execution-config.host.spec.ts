import { describe, expect, it } from 'vitest'
import SecurityRecordsService from '../src/index.ts'

describe('execution concurrency deployment limit', () => {
  it('defaults to three Workers and accepts one through ten', () => {
    expect(SecurityRecordsService.Config({}).executionMaxConcurrentWorkers).toBe(3)
    for (const executionMaxConcurrentWorkers of [1, 3, 10]) {
      const config = SecurityRecordsService.Config({ executionMaxConcurrentWorkers })
      expect(config.executionMaxConcurrentWorkers).toBe(executionMaxConcurrentWorkers)
    }
  })
  it.each([0, -1, 1.5, 11, Number.POSITIVE_INFINITY, Number.NaN])('rejects invalid concurrency %s', (executionMaxConcurrentWorkers) => {
    expect(() => SecurityRecordsService.Config({ executionMaxConcurrentWorkers })).toThrow()
  })
})
