// The list itself. Every function here is covered by test/todos.test.js.

export function createList() {
    return { nextId: 1, items: [] };
}

export function add(list, title) {
    const trimmed = String(title ?? '').trim();
    if (trimmed === '') return { ok: false, error: 'A todo needs a title.' };
    const item = { id: list.nextId++, title: trimmed, done: false };
    list.items.push(item);
    return { ok: true, item };
}

export function toggle(list, id) {
    const item = list.items.find((i) => i.id === id);
    if (item) item.done = !item.done;
    return item;
}

export function clearCompleted(list) {
    const before = list.items.length;
    list.items = list.items.filter((i) => !i.done);
    return before - list.items.length;
}

export function remaining(list) {
    return list.items.filter((i) => !i.done).length;
}
