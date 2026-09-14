const form = document.querySelector('form');
form.addEventListener('submit', () => {
  form.setAttribute('aria-busy', 'true');
  form.querySelector('button').disabled = true;
  document.querySelector('#loading').hidden = false;
});
window.addEventListener('pageshow', () => {
  form.removeAttribute('aria-busy');
  form.querySelector('button').disabled = false;
  document.querySelector('#loading').hidden = true;
});
