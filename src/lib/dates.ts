/** "2022-07" → "Jul 2022"; "present" stays as is. */
export const month = (m: string): string =>
  m === 'present'
    ? 'present'
    : new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
