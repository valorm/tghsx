/**
 * ==================================================================================
 * Authentication Logic (auth.js)
 *
 * Handles user registration, login, and backend status checks. This file is
 * largely unchanged but ensures compatibility with the shared utility functions.
 * ==================================================================================
 */

const BACKEND_URL = 'https://tghsx-backend.onrender.com'; // Example URL
let toastTimeout;

function showRegisterForm(event) {
    if (event) event.preventDefault();
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('registerEmail').focus();
}

function showLoginForm(event) {
    if (event) event.preventDefault();
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('loginEmail').focus();
}

function showToast(message, type = 'error') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}

function setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle('loading', loading);
}

async function checkBackendStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        updateStatus(response.ok);
    } catch (error) {
        updateStatus(false);
    }
}

function updateStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (!dot || !text) return;
    dot.classList.toggle('connected', connected);
    text.textContent = connected ? 'Server Online' : 'Server Offline';
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleAuthAction(action, email, password) {
    if (!email || !password) return showToast('Please fill in all fields');
    if (!validateEmail(email)) return showToast('Please enter a valid email address');
    if (action === 'register' && password.length < 6) return showToast('Password must be at least 6 characters');

    const buttonId = action === 'register' ? 'registerBtn' : 'loginBtn';
    setButtonLoading(buttonId, true);

    try {
        const response = await fetch(`${BACKEND_URL}/auth/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || `${action} failed`);

        localStorage.setItem('accessToken', data.access_token);
        
        const payload = JSON.parse(atob(data.access_token.split('.')[1]));
        const isAdmin = payload.role === 'admin';

        showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} successful! Redirecting...`, 'success');
        setTimeout(() => {
            window.location.href = isAdmin ? 'admin.html' : 'index.html';
        }, 1500);

    } catch (error) {
        showToast(error.message);
    } finally {
        setButtonLoading(buttonId, false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('accessToken')) {
        window.location.href = 'index.html';
        return;
    }

    checkBackendStatus();
    setInterval(checkBackendStatus, 30000);
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        handleAuthAction('login', email, password);
    });

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        handleAuthAction('register', email, password);
    });

    document.getElementById('showRegisterLink').addEventListener('click', showRegisterForm);
    document.getElementById('showLoginLink').addEventListener('click', showLoginForm);
});
