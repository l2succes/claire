export type AssistantQueryIntent = 'lookup' | 'plans' | 'people' | 'general';

export interface AssistantQueryPlan {
  intent: AssistantQueryIntent;
  searchQuery: string;
  lexicalQuery: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  messageRangeStart: string | null;
  messageRangeEnd: string | null;
  needsPeopleMemory: boolean;
  needsPlanMemory: boolean;
}

const STOP_WORDS = new Set([
  'a', 'about', 'am', 'and', 'are', 'be', 'can', 'conversation', 'did', 'do', 'find',
  'for', 'help', 'i', 'in', 'is', 'it', 'made', 'me', 'my', 'of', 'on', 'please',
  'remember', 'the', 'think', 'to', 'was', 'were', 'what', 'when', 'who', 'whom',
  'with', 'you', 'girl', 'guy', 'person', 'people', 'someone', 'past', 'couple', 'few', 'days',
  "who's", 'talking', 'know', 'based', 'lives', 'live', 'plan', 'plans', "don't", 'dont',
  'not', 'but',
]);

function dayRange(reference: Date, dayOfWeek: number, preferPast: boolean): [string, string] {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const current = start.getDay();
  let distance = preferPast ? -((current - dayOfWeek + 7) % 7) : ((dayOfWeek - current + 7) % 7);
  if (distance === 0 && preferPast) distance = -7;
  start.setDate(start.getDate() + distance);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

function temporalRange(question: string, now: Date): [string | null, string | null] {
  const lower = question.toLowerCase();
  if (/past (couple|few|2|two) (of )?days|last (couple|few|2|two) days/.test(lower)) {
    return [new Date(now.getTime() - 3 * 86_400_000).toISOString(), now.toISOString()];
  }
  if (/today|hoy/.test(lower)) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return [start.toISOString(), end.toISOString()];
  }
  if (/yesterday|ayer/.test(lower)) {
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 1);
    return [start.toISOString(), end.toISOString()];
  }
  if (/saturday|sábado|sabado/.test(lower)) {
    return dayRange(now, 6, /last saturday|sábado pasado|sabado pasado/.test(lower));
  }
  if (/this weekend|este fin de semana/.test(lower)) {
    const [start] = dayRange(now, 6, false);
    const end = new Date(start); end.setDate(end.getDate() + 2);
    return [start, end.toISOString()];
  }
  return [null, null];
}

function lexicalSearchQuery(question: string): string {
  const lower = question.toLowerCase();
  let terms = question
    .replace(/[^\p{L}\p{N}@'-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((term) => !STOP_WORDS.has(term.toLowerCase()))
    .slice(0, 18);
  if (/russian|rusa|ruso/.test(lower)) {
    terms = terms.filter((term) => !/^(russian|rusa|ruso)$/i.test(term));
    terms.push('Russian OR rusa OR ruso');
  }
  if (/mexico city|ciudad de méxico|ciudad de mexico|cdmx/.test(lower)) {
    terms = terms.filter((term) => !/^(mexico|city|ciudad|méxico|cdmx)$/i.test(term));
    terms.push('CDMX OR "Mexico City" OR "Ciudad de México"');
  }
  if (/brooklyn/.test(lower)) terms.push('Brooklyn OR BK');
  if (/saturday|sábado|sabado/.test(lower)) {
    terms = terms.filter((term) => !/^(saturday|sábado|sabado)$/i.test(term));
    terms.push('Saturday OR sábado OR sabado');
  }
  return [...new Set(terms)].join(' ').trim() || question.trim();
}

/** A deterministic, zero-token first-pass planner for the common personal-memory questions. */
export function planAssistantQuery(question: string, now = new Date()): AssistantQueryPlan {
  const lower = question.toLowerCase();
  const people = /closest|people|person|girl|guy|who do i know|who's|who is|contacts?|friends?|based in|lives? in/.test(lower);
  const plans = /plans?|meeting|meet|calendar|appointment|birthday|hang out|link up|quedar|vernos/.test(lower);
  const lookup = /find|conversation|talking about|remember|who was/.test(lower);
  const [rangeStart, rangeEnd] = temporalRange(question, now);
  const eventDateRatherThanMessageDate = plans && /saturday|sábado|sabado|this weekend|este fin de semana/.test(lower);
  return {
    intent: plans ? 'plans' : people ? 'people' : lookup ? 'lookup' : 'general',
    searchQuery: question.trim(),
    lexicalQuery: lexicalSearchQuery(question),
    rangeStart,
    rangeEnd,
    messageRangeStart: eventDateRatherThanMessageDate ? null : rangeStart,
    messageRangeEnd: eventDateRatherThanMessageDate ? null : rangeEnd,
    needsPeopleMemory: people || /mexico city|ciudad de méxico|ciudad de mexico|cdmx|brooklyn/.test(lower),
    needsPlanMemory: plans,
  };
}
