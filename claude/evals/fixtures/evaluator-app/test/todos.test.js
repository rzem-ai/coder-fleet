import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createList, add, toggle, clearCompleted, remaining } from '../src/todos.js';

test('add puts a trimmed title on the list', () => {
    const list = createList();
    const r = add(list, '  milk ');
    assert.equal(r.ok, true);
    assert.equal(list.items[0].title, 'milk');
});

test('add refuses an empty title', () => {
    const list = createList();
    assert.equal(add(list, '   ').ok, false);
    assert.equal(list.items.length, 0);
});

test('toggle marks an item done and back', () => {
    const list = createList();
    const { item } = add(list, 'milk');
    toggle(list, item.id);
    assert.equal(item.done, true);
    toggle(list, item.id);
    assert.equal(item.done, false);
});

test('clearCompleted removes done items and keeps the rest', () => {
    const list = createList();
    const a = add(list, 'a').item;
    add(list, 'b');
    toggle(list, a.id);
    assert.equal(clearCompleted(list), 1);
    assert.deepEqual(list.items.map((i) => i.title), ['b']);
});

test('remaining counts items not done', () => {
    const list = createList();
    const a = add(list, 'a').item;
    add(list, 'b');
    toggle(list, a.id);
    assert.equal(remaining(list), 1);
});
