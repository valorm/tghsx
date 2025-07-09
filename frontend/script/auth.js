/**
 * ==================================================================================
 * Authentication Logic (auth.js)
 *
 * Handles user registration, login, and backend status checks for the auth.html page.
 * ==================================================================================
 */

const BACKEND_URL = 'http://127.0.0.1:8000';
let toastTimeout;

/**
 * Displays the registration form and hides the login form.
 * @param {Event} event - The click event to prevent default link behavior.
 */
function showRegisterForm(event) {
    if (event) event.preventDefault();
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('registerEmail').focus();
}

/**
 * Displays the login form and hides the registration form.
 * @param {Event} event - The click event to prevent default link behavior.
 */
function showLoginForm(event) {
    if (event) event.preventDefault();
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('loginEmail').focus();
}

/**
 * Shows a toast notification.
 * @param {string} message - The message to display.
 * @param {string} type - The type of toast ('error', 'success', 'info').
 */
function showToast(message, type = 'error') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

/**
 * Toggles the loading state of a button.
 * @param {string} buttonId - The ID of the button element.
 * @param {boolean} loading - Whether to show the loading state.
 */
function setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle('loading', loading);
}

/**
 * Checks the status of the backend server.
 * @returns {Promise<boolean>} - True if the backend is online, false otherwise.
 */
async function checkBackendStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        updateStatus(response.ok);
        return response.ok;
    } catch (error) {
        updateStatus(false);
        return false;
    }
}

/**
 * Updates the UI element showing the server status.
 * @param {boolean} connected - Whether the server is connected.
 */
function updateStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (dot && text) {
        dot.classList.toggle('connected', connected);
        text.textContent = connected ? 'Server Online' : 'Server Offline';
    }
}

/**
 * Validates an email address format.
 * @param {string} email - The email to validate.
 * @returns {boolean} - True if the email is valid.
 */
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Handles the user registration process.
 */
async function registerUser() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;

    if (!email || !password) return showToast('Please fill in all fields');
    if (!validateEmail(email)) return showToast('Please enter a valid email address');
    if (password.length < 6) return showToast('Password must be at least 6 characters');

    setButtonLoading('registerBtn', true);
    try {
        const response = await fetch(`${BACKEND_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Registration failed');
        
        showToast('Registration successful! Logging you in...', 'success');
        if (data.access_token) {
            localStorage.setItem('accessToken', data.access_token);
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        } else {
             throw new Error('Did not receive access token on registration.');
        }

    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading('registerBtn', false);
    }
}

/**
 * Handles the user login process.
 */
async function loginUser() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) return showToast('Please fill in all fields');
    if (!validateEmail(email)) return showToast('Please enter a valid email address');

    setButtonLoading('loginBtn', true);
    try {
        const response = await fetch(`${BACKEND_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Login failed');

        localStorage.setItem('accessToken', data.access_token);
        
        let isAdmin = false;
        try {
            const payload = JSON.parse(atob(data.access_token.split('.')[1]));
            if (payload.role === 'admin') {
                isAdmin = true;
            }
        } catch (e) {
            console.error("Error decoding token:", e);
            isAdmin = false;
        }

        showToast('Login successful! Redirecting...', 'success');
        setTimeout(() => {
            window.location.href = isAdmin ? 'admin.html' : 'index.html';
        }, 1500);

    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading('loginBtn', false);
    }
}

/**
 * Handles the 'Enter' key press to submit the form.
 * @param {KeyboardEvent} event - The keyboard event.
 */
function handleEnterKey(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (!document.getElementById('loginForm').classList.contains('hidden')) {
            loginUser();
        } else {
            registerUser();
        }
    }
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('accessToken')) {
        window.location.href = 'index.html';
        return;
    }

    checkBackendStatus();
    document.getElementById('loginEmail').focus();
    
    document.getElementById('loginBtn').addEventListener('click', loginUser);
    document.getElementById('registerBtn').addEventListener('click', registerUser);
    document.getElementById('showRegisterLink').addEventListener('click', showRegisterForm);
    document.getElementById('showLoginLink').addEventListener('click', showLoginForm);
    document.addEventListener('keypress', handleEnterKey);

    setInterval(checkBackendStatus, 30000);
});
