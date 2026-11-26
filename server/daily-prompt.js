import { createHash } from 'node:crypto';
import { heartDay, validHeartDay } from './heart-counts.js';
import { UUID } from './daily-memory.js';

const PEOPLE = ['asnat', 'youssef'];

export const DAILY_PROMPTS = [
  'What little moment with me made you smile recently?',
  'If we had an unplanned Sunday together tomorrow, how would it start?',
  'What is one small thing I do that always makes you feel loved?',
  'Which song instantly makes you think of us right now?',
  'What is a cozy date night you want us to have soon?',
  'What is one memory of us that you replay when you miss me?',
  'If we could teleport anywhere for dinner tonight, where are we going?',
  'What is something new you want to learn or try together this year?',
  'What did you notice about me this week that you really loved?',
  'What is your favorite time of day to talk with me?',
  'If you had to describe our vibe in three words today, what are they?',
  'What is one place you cannot wait to show me or go back to with me?',
  'What made you feel proud of yourself or of us lately?',
  'What tiny habit of mine secretly makes you laugh?',
  'If we made a movie about us, what would the opening scene be?',
  'What is one thing you are looking forward to with me this month?',
  'What comfort food should we cook or order on our next lazy night?',
  'When did you last think, I wish you were right here?',
  'What is a photo of us you would definitely frame?',
  'What kind of morning person do you want us to be on vacation?',
  'What is a compliment you have been meaning to give me?',
  'If we spent a whole day offline together, what would we do?',
  'What is something I said that stayed with you?',
  'What season feels the most like us, and why?',
  'What is one tiny adventure we can fit into a regular weeknight?',
  'What makes our conversations feel different from anyone else?',
  'What is a dream trip we should definitely put on our list?',
  'What is your favorite way for me to say goodnight?',
  'What is something silly you want to do together soon?',
  'What part of today do you want to tell me about first?',
  'What makes you feel most peaceful when we are together?',
  'If you could bottle one smell or sound from our memories, which one?',
  'What is a little ritual you want us to keep forever?',
  'What is one thing I can do this week to make your days lighter?',
  'What moment made you realize how close we are?',
  'If we hosted a two-person movie marathon tonight, what is on first?',
  'What is a small detail about how we started that you never want to forget?',
  'What are you most grateful for about us right now?',
  'What is a future ordinary day with me that you imagine sometimes?',
  'What is one question you have been wanting to ask me lately?',
  'What makes you feel instantly cheered up when we talk?',
  'If we wrote a postcard to ourselves a year from now, what would it say?',
  'What is a cozy cafe, park, or corner we should explore next?',
  'What is something we are really good at as a team?',
  'What little surprise would make your whole week?',
  'What is a laugh we shared that you still remember vividly?',
  'What is your favorite kind of message to wake up to from me?',
  'If we had a slow rainy afternoon together, how would we spend it?',
  'What is something you admire about how the other handles hard days?',
  'What is one memory we have not made yet that excites you most?',
  'What is a tiny tradition we should start for our monthly anniversaries?',
  'What is the softest or sweetest thing you felt this week?',
  'If we took a spontaneous road trip, who is DJ and where are we headed?',
  'What makes you feel truly understood by me?',
  'What is a late-night snack we should always keep around?',
  'What is one thing you want to celebrate together soon?',
  'What is a tiny photo you wish you had taken of us?',
  'What does home feel like when you picture us?',
  'What is one promise or wish you want to tuck into today?',
  'What is your favorite thing about who we are becoming together?',
];

export function promptForDay(day) {
  const digest = createHash('sha256').update(`asechka:prompt:${day}`).digest();
  const index = digest.readUInt32BE(0) % DAILY_PROMPTS.length;
  return DAILY_PROMPTS[index];
}

export function checkedPromptChange(input) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  if (!input || input.action !== 'answerPrompt' || !UUID.test(input.operationId || '') || !PEOPLE.includes(input.actor)) {
    fail('Choose your profile before answering today’s question.');
  }
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 400) {
    fail('Write an answer between 1 and 400 characters.');
  }
  if (input.day !== undefined && !validHeartDay(input.day)) {
    fail('Check today’s date and try again.');
  }
  return {
    action: 'answerPrompt',
    operationId: input.operationId,
    actor: input.actor,
    text: input.text.trim(),
    ...(input.day ? { day: input.day } : {}),
  };
}

export function applyPromptAnswer(data, change, now = new Date()) {
  const today = heartDay(now);
  const day = change.day || today;
  if (day !== today) {
    throw Object.assign(new Error('Today’s question has already rolled over. Refresh to see the new one.'), { status: 409 });
  }
  data.dailyPrompts ||= {};
  const entry = data.dailyPrompts[day] ||= { prompt: promptForDay(day), answers: {} };
  entry.prompt ||= promptForDay(day);
  entry.answers ||= {};
  const existing = entry.answers[change.actor];
  if (existing?.id === change.operationId) {
    if (existing.text !== change.text) {
      throw Object.assign(new Error('That answer was already saved with different text.'), { status: 409 });
    }
    return false;
  }
  entry.answers[change.actor] = {
    id: change.operationId,
    text: change.text,
    answeredAt: now.toISOString(),
  };
  // Keep the most recent 45 days bounded in storage.
  const days = Object.keys(data.dailyPrompts).sort();
  if (days.length > 45) {
    for (const oldDay of days.slice(0, days.length - 45)) delete data.dailyPrompts[oldDay];
  }
  return true;
}

export function publicDailyPrompt(data, now = new Date(), viewer = '') {
  const today = heartDay(now);
  const viewerActor = PEOPLE.includes(viewer) ? viewer : '';
  const entry = data?.dailyPrompts?.[today];
  const rawAsnat = entry?.answers?.asnat || null;
  const rawYoussef = entry?.answers?.youssef || null;
  const revealed = Boolean(rawAsnat && rawYoussef);

  const formatAnswer = (actor, raw) => {
    if (!raw) return { answered: false, answeredAt: null, text: null };
    const canRead = revealed || viewerActor === actor;
    return {
      answered: true,
      answeredAt: raw.answeredAt || null,
      text: canRead ? raw.text : null,
    };
  };

  const history = Object.entries(data?.dailyPrompts || {})
    .filter(([day, item]) => day < today && item?.answers?.asnat?.text && item?.answers?.youssef?.text)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7)
    .map(([day, item]) => ({
      day,
      prompt: item.prompt || promptForDay(day),
      answers: {
        asnat: item.answers.asnat.text,
        youssef: item.answers.youssef.text,
      },
    }));

  return {
    day: today,
    prompt: entry?.prompt || promptForDay(today),
    revealed,
    answers: {
      asnat: formatAnswer('asnat', rawAsnat),
      youssef: formatAnswer('youssef', rawYoussef),
    },
    history,
  };
}
