document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const adminLoginToggle = document.getElementById('adminLoginToggle');
    const userLoginToggle = document.getElementById('userLoginToggle');
    const notification = document.getElementById('notification');

    const API_BASE_URL = 'https://tghsx.onrender.com';

    const showNotification = (message, isError = false) => {
        notification.textContent = message;
        notification.style.color = isError ? '#f44336' : '#4CAF50';
        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    };

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = loginForm.email.value;
            const password = loginForm.password.value;
            const isAdminLogin = document.getElementById('auth-container').classList.contains('admin-login-active');
            
            // CORRECTED: The API endpoint now includes the /api/v1 prefix.
            const endpoint = isAdminLogin ? '/api/v1/auth/admin-login' : '/api/v1/auth/login';

            try {
                const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Login failed.');
                }

                showNotification('Login successful!', false);
                // Store the correct token based on login type
                if (isAdminLogin) {
                    localStorage.setItem('adminAccessToken', data.access_token);
                    window.location.href = '/app/admin.html';
                } else {
                    localStorage.setItem('accessToken', data.access_token);
                    window.location.href = '/app/index.html';
                }

            } catch (error) {
                showNotification(error.message, true);
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = registerForm.email.value;
            const password = registerForm.password.value;
            const wallet_address = registerForm.wallet_address.value;

            try {
                // CORRECTED: The API endpoint now includes the /api/v1 prefix.
                const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, wallet_address })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Registration failed.');
                }
                
                showNotification(data.message || 'Registration successful! Please log in.', false);
                // Switch to the login form after successful registration
                document.getElementById('auth-container').classList.remove('register-active');

            } catch (error) {
                showNotification(error.message, true);
            }
        });
    }

    if (adminLoginToggle) {
        adminLoginToggle.addEventListener('click', () => {
            document.getElementById('auth-container').classList.add('admin-login-active');
        });
    }

    if (userLoginToggle) {
        userLoginToggle.addEventListener('click', () => {
            document.getElementById('auth-container').classList.remove('admin-login-active');
        });
    }
});
