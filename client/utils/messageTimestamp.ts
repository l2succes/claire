const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface FormatInboxTimestampOptions {
  locale?: Intl.LocalesArgument;
  now?: Date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getCalendarDayDifference(laterDate: Date, earlierDate: Date) {
  const laterDay = startOfLocalDay(laterDate).getTime();
  const earlierDay = startOfLocalDay(earlierDate).getTime();

  return Math.round((laterDay - earlierDay) / MS_PER_DAY);
}

export function formatInboxTimestamp(
  value: string | number | Date,
  options: FormatInboxTimestampOptions = {}
) {
  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return '';
  }

  const now = options.now ?? new Date();
  const locale = options.locale;
  const dayDifference = getCalendarDayDifference(now, timestamp);

  if (dayDifference <= 0) {
    return new Intl.DateTimeFormat(locale, {
      timeStyle: 'short',
    }).format(timestamp);
  }

  if (dayDifference === 1) {
    return 'Yesterday';
  }

  if (dayDifference < 7) {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
    }).format(timestamp);
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
  }).format(timestamp);
}
