// [snowpack] add styles to the page (skip if no document exists)
if (typeof document !== 'undefined') {
  const code = "#app {\n  background: #1E293B;\n  min-height: 100vh;\n\n  display: grid;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.25em;\n}\n\n#intro {\n  width: 50vw;\n}\n\n#intro h1, #intro h3 {\n  font-family: Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif;\n}\n\n#intro img {\n  float: left;\n  width: 6.5em;\n  margin: 0.5em 2em;\n}\n\n#intro a {\n  color: #FFFFFF;\n}\n\n.todo-input {\n  padding: 1em;\n  width: 300px;\n}\n\n.add-btn {\n  padding: 1em 2em;\n  cursor: pointer;\n  font-weight: bold;\n  font-size: 1em;\n}\n";

  const styleEl = document.createElement("style");
  const codeEl = document.createTextNode(code);
  styleEl.type = 'text/css';

  styleEl.appendChild(codeEl);
  document.head.appendChild(styleEl);
}