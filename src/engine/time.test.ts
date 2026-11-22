import { describe, expect, it } from 'vitest'
import {
  ARC_DAYS,
  ARC_END,
  ARC_START,
  addDays,
  arcDayNumber,
  chapterOf,
  confessionDeadline,
  diffDays,
  eveningMinutes,
  formatHM,
  gameDayOf,
  isConfessionOpen,
  isPastDeadline,
  parseHM,
  wakeOnTarget,
  wakeTarget,
  weekDays,
  weekOf,
  weekday,
} from './time'

describe('граница дня 04:00', () => {
  it('до 04:00 — ещё предыдущий игровой день', () => {
    expect(gameDayOf(new Date(2026, 10, 24, 3, 59))).toBe('2026-11-23')
    expect(gameDayOf(new Date(2026, 10, 24, 0, 30))).toBe('2026-11-23')
  })
  it('с 04:00 — новый день', () => {
    expect(gameDayOf(new Date(2026, 10, 24, 4, 0))).toBe('2026-11-24')
    expect(gameDayOf(new Date(2026, 10, 24, 23, 59))).toBe('2026-11-24')
  })
  it('переход через месяц и год', () => {
    expect(gameDayOf(new Date(2026, 11, 1, 2, 0))).toBe('2026-11-30')
    expect(gameDayOf(new Date(2027, 0, 1, 3, 0))).toBe('2026-12-31')
  })
})

describe('даты', () => {
  it('арифметика дней', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(diffDays('2026-11-23', '2027-02-28')).toBe(97)
  })
  it('арка — 98 дней с понедельника по воскресенье', () => {
    expect(arcDayNumber(ARC_END)).toBe(ARC_DAYS)
    expect(arcDayNumber(ARC_START)).toBe(1)
    expect(weekday(ARC_START)).toBe(0)
    expect(weekday(ARC_END)).toBe(6)
  })
})

describe('главы', () => {
  it.each([
    ['2026-11-23', 0],
    ['2026-11-29', 0],
    ['2026-11-30', 1],
    ['2027-01-03', 1],
    ['2027-01-04', 2],
    ['2027-01-31', 2],
    ['2027-02-01', 3],
    ['2027-02-28', 3],
  ] as const)('%s → глава %i', (day, ch) => {
    expect(chapterOf(day)).toBe(ch)
  })
})

describe('недели и боссы', () => {
  it('14 недель пн–вс', () => {
    expect(weekOf('2026-11-23')).toBe(1)
    expect(weekOf('2026-11-29')).toBe(1)
    expect(weekOf('2026-11-30')).toBe(2)
    expect(weekOf('2027-01-04')).toBe(7)
    expect(weekOf('2027-02-01')).toBe(11)
    expect(weekOf('2027-02-28')).toBe(14)
    expect(weekDays(14)[6]).toBe(ARC_END)
    expect(weekDays(2)[0]).toBe('2026-11-30')
  })
})

describe('окно исповеди', () => {
  const d = '2026-11-25'
  it('открывается в 20:00 и принимается задним числом до 16:00 следующего дня', () => {
    expect(isConfessionOpen(d, new Date(2026, 10, 25, 19, 59))).toBe(false)
    expect(isConfessionOpen(d, new Date(2026, 10, 25, 20, 0))).toBe(true)
    expect(isConfessionOpen(d, new Date(2026, 10, 26, 2, 0))).toBe(true)
    expect(isConfessionOpen(d, new Date(2026, 10, 26, 15, 59))).toBe(true)
    expect(isConfessionOpen(d, new Date(2026, 10, 26, 16, 0))).toBe(false)
    expect(confessionDeadline(d).getHours()).toBe(16)
    expect(isPastDeadline(d, new Date(2026, 10, 26, 16, 0))).toBe(true)
  })
})

describe('время подъёма', () => {
  it('план сдвига: каждые 2 дня на 30 мин раньше до 07:00', () => {
    const s = '2026-11-23'
    expect(formatHM(wakeTarget('09:00', s, s))).toBe('08:30')
    expect(formatHM(wakeTarget('09:00', s, addDays(s, 1)))).toBe('08:30')
    expect(formatHM(wakeTarget('09:00', s, addDays(s, 2)))).toBe('08:00')
    expect(formatHM(wakeTarget('09:00', s, addDays(s, 4)))).toBe('07:30')
    expect(formatHM(wakeTarget('09:00', s, addDays(s, 6)))).toBe('07:00')
    expect(formatHM(wakeTarget('09:00', s, addDays(s, 40)))).toBe('07:00')
    expect(formatHM(wakeTarget('06:30', s, s))).toBe('07:00')
  })
  it('до 30 минут позже цели, раньше — всегда засчитано', () => {
    const t = parseHM('07:00')
    expect(wakeOnTarget('05:45', t)).toBe(true)
    expect(wakeOnTarget('06:30', t)).toBe(true)
    expect(wakeOnTarget('07:30', t)).toBe(true)
    expect(wakeOnTarget('07:31', t)).toBe(false)
  })
  it('время отбоя после полуночи — позже, чем 23:30', () => {
    expect(eveningMinutes('00:30')).toBeGreaterThan(eveningMinutes('23:30'))
    expect(eveningMinutes('23:00')).toBeLessThan(eveningMinutes('23:30'))
  })
})
