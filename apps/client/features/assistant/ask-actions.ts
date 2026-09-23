export const GLOBAL_ASK_ACTIONS = [
  {
    id: 'attention',
    label: 'What needs attention?',
    description: 'Open questions and plans across chats.',
    prompt: 'Across my connected conversations, what commitments, questions, or plans need my attention? Cite the messages behind each item.',
  },
  {
    id: 'find',
    label: 'Find across chats',
    description: 'Describe a message or plan to find.',
    prompt: null,
  },
] as const;

export const CONVERSATION_ASK_ACTIONS = [
  {
    id: 'catch-me-up',
    label: 'Catch me up',
    description: 'Summarize this conversation.',
    prompt: 'Catch me up on this conversation. Keep it concise and cite the important moments.',
  },
  {
    id: 'open-loops',
    label: 'What’s unresolved?',
    description: 'Commitments and unanswered questions.',
    prompt: 'What commitments, questions, or open loops are still unresolved in this conversation? Cite the relevant messages.',
  },
  {
    id: 'tone',
    label: 'Check the tone',
    description: 'Read the tone of this chat.',
    prompt: 'What is the tone of this conversation lately? Separate observations from inference and suggest a constructive next step.',
  },
] as const;
