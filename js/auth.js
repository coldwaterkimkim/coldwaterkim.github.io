import { supabase } from './supabase.js';

const loginPanel = document.getElementById('loginPanel');
const editorPanel = document.getElementById('editorPanel');
const form = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

// Check initial session
supabase.auth.getSession().then(({ data: { session } }) => {
  checkGuard(session);
  updateUI(session);
});

// Listen for auth changes
supabase.auth.onAuthStateChange((_event, session) => {
  checkGuard(session);
  updateUI(session);
});

function checkGuard(session) {
  const path = window.location.pathname;
  // If no session & on admin page -> bounce to login
  if (path.endsWith('admin.html') && !session) {
    window.location.replace('login.html');
    return;
  }
  // If session & on login page -> bounce to admin
  // (Assuming login.html is only for anonymous users)
  if (path.endsWith('login.html') && session) {
    window.location.replace('admin.html');
    return;
  }
}

function updateUI(session) {
  // admin.html specific UI
  if (editorPanel) {
    if (session) {
      editorPanel.style.display = 'block';
    } else {
      editorPanel.style.display = 'none';
    }
  }
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      if (loginError) loginError.textContent = 'Login failed: ' + error.message;
      else alert('Login failed: ' + error.message);
    } else {
      // Successful login will trigger onAuthStateChange -> checkGuard -> redirect
    }
  });
}
