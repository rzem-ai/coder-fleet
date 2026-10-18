// A server-rendered todo list. Plain HTML forms, so a browser and curl drive it
// the same way. PORT overrides the port in AGENTS.md's App url.

import http from 'node:http';
import { createList, add, toggle, clearCompleted, remaining } from './todos.js';

const list = createList();
let flash = '';

function escape(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function page() {
    const rows = list.items.map((i) => `
      <li class="${i.done ? 'done' : ''}" data-id="${i.id}">
        <form method="post" action="/toggle/${i.id}"><button type="submit">${i.done ? 'Undo' : 'Done'}</button></form>
        <span class="title">${escape(i.title)}</span>
      </li>`).join('');
    const message = flash ? `<p class="flash" role="alert">${escape(flash)}</p>` : '';
    flash = '';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Todos</title>
<style>.done .title { text-decoration: line-through; } li { list-style: none; } form { display: inline; }</style>
</head><body>
<h1>Todos</h1>
${message}
<form method="post" action="/add"><input name="title" aria-label="New todo"><button type="submit">Add</button></form>
<ul id="todos">${rows}</ul>
<p id="remaining">${remaining(list)} left</p>
<form method="post" action="/clear-completed"><button type="submit">Clear completed</button></form>
</body></html>`;
}

function body(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', (c) => { data += c; });
        req.on('end', () => resolve(new URLSearchParams(data)));
    });
}

function back(res) {
    res.writeHead(303, { Location: '/' });
    res.end();
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page());
        return;
    }
    if (req.method === 'POST' && req.url === '/add') {
        const result = add(list, (await body(req)).get('title'));
        if (!result.ok) flash = result.error;
        back(res);
        return;
    }
    const toggled = req.method === 'POST' && req.url.match(/^\/toggle\/(\d+)$/);
    if (toggled) {
        toggle(list, Number(toggled[1]));
        back(res);
        return;
    }
    if (req.method === 'POST' && req.url === '/clear-completed') {
        await body(req);
        back(res);
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
});

const port = Number(process.env.PORT || 4317);
server.listen(port, '127.0.0.1', () => {
    console.log(`todos listening on http://localhost:${port}`);
});
