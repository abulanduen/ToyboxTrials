/* Hub chat text: cleaning and the word filter (src/net/chatFilter.ts), and the protocol shapes for chat and cards. */
import { describe, expect, it } from 'vitest';
import { CHAT_MAX, CHAT_RAW_MAX, cleanChatText, filterChat } from '../../src/net/chatFilter';
import { validateClientMessage, validateServerMessage } from '../../src/net/protocol';

describe('cleaning chat text', () => {
  it('trims, collapses whitespace and drops control and invisible characters', () => {
    expect(cleanChatText('  hello\n\n  there\t ')).toBe('hello there');
    expect(cleanChatText('hi\u0000\u0007 you')).toBe('hi you');
    expect(cleanChatText('a​b‍c‮d⁦e')).toBe('abcde'); // zero-width and bidi controls
    expect(cleanChatText('xy')).toBe('xy'); // private use
    expect(cleanChatText(' line ')).toBe('line');
  });
  it('limits stacked combining marks', () => {
    const zalgo = 'h' + '́̂̃̄̅̆' + 'i';
    expect(Array.from(cleanChatText(zalgo).normalize('NFD')).length).toBeLessThanOrEqual(4);
  });
  it('cuts to CHAT_MAX characters (whole code points) and returns empty for nothing', () => {
    expect(Array.from(cleanChatText('a'.repeat(500))).length).toBe(CHAT_MAX);
    const astral = '\u{1F600}'.repeat(200);
    expect(Array.from(cleanChatText(astral)).length).toBe(CHAT_MAX);
    expect(cleanChatText('   \n ')).toBe('');
    expect(cleanChatText(42)).toBe('');
  });
});

describe('the word filter', () => {
  it('masks swear words and slurs with stars, keeping punctuation', () => {
    expect(filterChat('oh shit!')).toBe('oh ****!');
    expect(filterChat('what the FUCK')).toBe('what the ****');
    expect(filterChat('you are a bitch.')).toBe('you are a *****.');
  });
  it('sees through letter swaps, repeats and spacing', () => {
    expect(filterChat('5h1t happens')).toBe('**** happens');
    expect(filterChat('fuuuuck')).toBe('*******');
    expect(filterChat('f u c k this')).toBe('* * * * this');
    expect(filterChat('s.h.i.t')).toBe('*******');
    expect(filterChat('go kill yourself')).toBe('go **** ********');
  });
  it('leaves ordinary words alone (no "class", "grape" or "cocktail" problems)', () => {
    for (const ok of ['the class assignment', 'a bunch of grapes', 'cocktail sausages', 'scrape your knee', 'Dickens wrote books', 'a peacock', 'assassin', 'torpedo', 'a cucumber', 'penguin', 'Am I a pirate?', 'hello there']) {
      expect(filterChat(ok), ok).toBe(ok);
    }
  });
});

describe('protocol: chat and cards (v5)', () => {
  it('accepts a chat message up to the raw limit and the two card actions', () => {
    expect(validateClientMessage({ t: 'chat', text: 'hi' })).toEqual({ t: 'chat', text: 'hi' });
    expect(validateClientMessage({ t: 'chat', text: 'x'.repeat(CHAT_RAW_MAX + 1) })).toBeNull();
    expect(validateClientMessage({ t: 'chat', text: 5 })).toBeNull();
    expect(validateClientMessage({ t: 'card', a: 'deal' })).toEqual({ t: 'card', a: 'deal' });
    expect(validateClientMessage({ t: 'card', a: 'peel' })).toEqual({ t: 'card', a: 'peel' });
    expect(validateClientMessage({ t: 'card', a: 'steal' })).toBeNull();
  });
  it('parses the server messages defensively', () => {
    expect(validateServerMessage({ t: 'chat', id: 'p1', name: 'Ann', text: 'hi', n: 3, m: 1 })).toEqual({ t: 'chat', id: 'p1', name: 'Ann', text: 'hi', n: 3, m: 1 });
    expect(validateServerMessage({ t: 'chat', id: '<script>', name: 'Ann', text: 'hi', n: 3 })).toBeNull();
    expect(validateServerMessage({ t: 'chatNote', code: 'slow', message: 'Slow', wait: 1500 })).toMatchObject({ code: 'slow', wait: 1500 });
    expect(validateServerMessage({ t: 'chatNote', code: 'nope', message: 'x' })).toBeNull();
    expect(validateServerMessage({ t: 'card', k: 'on', id: 'p1', name: 'Ann' })).toEqual({ t: 'card', k: 'on', id: 'p1', name: 'Ann' });
    expect(validateServerMessage({ t: 'card', k: 'solved', id: 'p1', name: 'Ann', w: 'penguin', ar: 'a' })).toMatchObject({ w: 'penguin', ar: 'a' });
    expect(validateServerMessage({ t: 'cards', c: [{ id: 'p1' }, { id: 'p2', w: 'kite' }, { id: 7 }] })).toEqual({ t: 'cards', c: [{ id: 'p1' }, { id: 'p2', w: 'kite' }] });
  });
});
