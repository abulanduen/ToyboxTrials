/* Who Am I? cards and answers (src/game/whoAmI.ts, src/game/whoAmICards.ts). */
import { describe, expect, it } from 'vitest';
import { WHO_CARDS, answerKeys, articleFor, dealIndex, fold, guessCore, isCorrectGuess, maskAnswers, maskWord, withArticle, type WhoCard } from '../../src/game/whoAmI';
import { seededRng } from '../../src/minigames/rng';
import { filterChat } from '../../src/net/chatFilter';

const card = (name: string) => WHO_CARDS.find((c) => c.name === name)!;

describe('the deck', () => {
  it('has at least 120 everyday things across animals, jobs, foods and objects', () => {
    expect(WHO_CARDS.length).toBeGreaterThanOrEqual(120);
    for (const k of ['animal', 'job', 'food', 'object']) expect(WHO_CARDS.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(20);
  });
  it('has unique, plain lower-case names that fit on a card', () => {
    const names = WHO_CARDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toMatch(/^[a-z]+( [a-z]+)?$/);
      expect(n.length).toBeLessThanOrEqual(14);
    }
  });
  it('never makes one card answer another card (two cards with the same answer would be unfair)', () => {
    const owner = new Map<string, string>();
    for (const c of WHO_CARDS) {
      for (const k of [fold(c.name).replace(/ /g, ''), ...(c.also ?? []).map((a) => fold(a).replace(/ /g, ''))]) {
        expect(owner.get(k) ?? c.name, `"${k}" answers both ${owner.get(k)} and ${c.name}`).toBe(c.name);
        owner.set(k, c.name);
      }
    }
  });
  it('keeps the card words clear of the chat word filter', () => {
    for (const c of WHO_CARDS) expect(filterChat(c.name)).toBe(c.name);
  });
});

describe('guessing', () => {
  it('accepts the name with any case, article, punctuation and guess phrasing', () => {
    const p = card('penguin');
    for (const g of ['penguin', 'Penguin', 'PENGUIN!', 'a penguin', 'the penguin?', 'Am I a penguin?', "I'm a penguin", 'is it a penguin??', 'i think i am a penguin', 'penguin maybe', 'penguins', 'umm... a penguin']) {
      expect(isCorrectGuess(p, g), g).toBe(true);
    }
  });
  it('accepts aliases, irregular and regular plurals, and spacing or hyphen variants', () => {
    expect(isCorrectGuess(card('police officer'), 'am I a cop')).toBe(true);
    expect(isCorrectGuess(card('police officer'), 'police officers')).toBe(true);
    expect(isCorrectGuess(card('police officer'), 'Policewoman')).toBe(true);
    expect(isCorrectGuess(card('ice cream'), 'ice-cream')).toBe(true);
    expect(isCorrectGuess(card('ice cream'), 'icecream')).toBe(true);
    expect(isCorrectGuess(card('mouse'), 'mice')).toBe(true);
    expect(isCorrectGuess(card('strawberry'), 'strawberries')).toBe(true);
    expect(isCorrectGuess(card('firefighter'), 'a fire fighter')).toBe(true);
    expect(isCorrectGuess(card('firefighter'), 'fireman')).toBe(true);
    expect(isCorrectGuess(card('rabbit'), 'bunny')).toBe(true);
    expect(isCorrectGuess(card('umbrella'), 'an umbrella')).toBe(true);
    expect(isCorrectGuess(card('pancake'), 'crêpe')).toBe(true); // accents ignored
  });
  it('rejects other words, questions about the card and empty guesses', () => {
    const p = card('penguin');
    for (const g of ['', '?', 'a', 'am I an animal?', 'is it a bird', 'pen', 'penguin or seal', 'do I live where it is cold', 'puffin']) expect(isCorrectGuess(p, g), g).toBe(false);
    expect(guessCore('Am I a bird?')).toBe('bird');
  });
});

describe('anti-spoiler masking', () => {
  const p = card('penguin');
  it('masks the answer for its holder, keeping the first letter', () => {
    expect(maskWord('penguin')).toBe('p******');
    expect(maskAnswers('You are a penguin!', p)).toBe('You are a p******!');
    expect(maskAnswers('PENGUINS waddle', p)).toBe('P******* waddle');
    expect(maskAnswers('penguinish vibes', p)).toBe('p********* vibes');
  });
  it('catches letters spelled out or split up', () => {
    expect(maskAnswers('p e n g u i n', p)).toBe('p * * * * * *');
    expect(maskAnswers('pen guin', p)).toBe('p** g***');
  });
  it('masks aliases and multi-word answers too', () => {
    expect(maskAnswers('you are a cop lol', card('police officer'))).toBe('you are a c** lol');
    expect(maskAnswers('a police officer', card('police officer'))).toBe('a p***** o******');
    expect(maskAnswers('cold ice cream', card('ice cream'))).toBe('cold i** c****');
  });
  it('leaves messages without the answer untouched, and short answers match whole words only', () => {
    expect(maskAnswers('You live where it is cold', p)).toBe('You live where it is cold');
    const cat = card('cat');
    expect(maskAnswers('a category of things', cat)).toBe('a category of things');
    expect(maskAnswers('you are a CAT', cat)).toBe('you are a C**');
  });
});

describe('dealing and announcing', () => {
  it('deals uniformly over the deck, skipping cards to avoid while any are left', () => {
    const rng = seededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const k = dealIndex(rng, [0, 1, 2]);
      expect(k).toBeGreaterThan(2);
      seen.add(k);
    }
    expect(seen.size).toBe(WHO_CARDS.length - 3);
    expect(dealIndex(() => 0.5, WHO_CARDS.map((_, i) => i))).toBeGreaterThanOrEqual(0); // everything avoided: still deals
  });
  it('uses the right article', () => {
    expect(withArticle('penguin', articleFor(card('penguin')))).toBe('a penguin');
    expect(withArticle('umbrella', articleFor(card('umbrella')))).toBe('an umbrella');
    expect(withArticle('scissors', articleFor(card('scissors')))).toBe('scissors');
  });
  it('folds text for comparison', () => {
    expect(fold("  Crème-brûlée, it's!  ")).toBe('creme brulee its');
    expect(answerKeys({ name: 'ice cream', kind: 'food' } as WhoCard).has('icecreams')).toBe(true);
  });
});
