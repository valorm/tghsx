document.addEventListener('DOMContentLoaded', () => {
    // Check for admin token on page load
    if (!localStorage.getItem('adminAccessToken')) {
        // Redirect to admin login if not authenticated
        window.location.href = '/app/auth.html?admin=true';
    } else {
        // Initial data fetch
        refreshAllData();
    }
});

const API_BASE_URL = 'https://tghsx.onrender.com';

/**
 * A centralized function for making authenticated API calls.
 * @param {string} endpoint - The API endpoint (e.g., '/api/v1/admin/status').
 * @param {string} method - The HTTP method (e.g., 'GET', 'POST').
 * @param {object|null} body - The request body for POST/PUT requests.
 * @returns {Promise<any>} - The JSON response from the API.
 */
async function apiCall(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('adminAccessToken');
    if (!token) {
        console.error("Admin access token not found.");
        window.location.href = '/app/auth.html?admin=true';
        throw new Error("Admin not authenticated.");
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };

    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to parse error response." }));
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API call to ${endpoint} failed:`, error.message);
        // Optionally, display a user-friendly error message in the UI
        showAdminNotification(error.message, true);
        throw error;
    }
}

/**
 * Fetches the protocol status from the backend.
 */
async function fetchContractStatus() {
    try {
        // CORRECTED: Added /api/v1/ prefix to the endpoint.
        const data = await apiCall('/api/v1/admin/status');
        document.getElementById('total-collateral').textContent = `${parseFloat(data.total_collateral_wei) / 1e18} ETH`;
        document.getElementById('total-tghsx-supply').textContent = `${parseFloat(data.total_tghsx_supply_wei) / 1e18} TGHSX`;
        console.log("Successfully fetched protocol status.", data);
    } catch (error) {
        console.error("Could not fetch contract status.");
    }
}

/**
 * Fetches pending mint requests from the backend.
 */
async function fetchPendingRequests() {
    try {
        // CORRECTED: Added /api/v1/ prefix and fixed the path.
        const requests = await apiCall('/api/v1/mint/admin/pending-requests');
        const pendingList = document.getElementById('pending-requests-list');
        pendingList.innerHTML = ''; // Clear existing list

        if (requests.length === 0) {
            pendingList.innerHTML = '<li>No pending requests.</li>';
            return;
        }

        requests.forEach(req => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                User ID: ${req.user_id} <br>
                Collateral: ${req.collateral_amount} ETH <br>
                Mint Amount: ${req.mint_amount} TGHSX
                <button onclick="approveRequest('${req.id}')">Approve</button>
                <button onclick="declineRequest('${req.id}')">Decline</button>
            `;
            pendingList.appendChild(listItem);
        });
        console.log("Successfully fetched pending requests.", requests);
    } catch (error) {
        console.error("Could not fetch pending requests.");
    }
}

/**
 * Refreshes all data on the admin dashboard.
 */
function refreshAllData() {
    fetchContractStatus();
    fetchPendingRequests();
    // Add other data fetching functions here
}

/**
 * Displays a notification message on the admin page.
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if the message is an error.
 */
function showAdminNotification(message, isError = false) {
    const notification = document.getElementById('admin-notification');
    if (notification) {
        notification.textContent = message;
        notification.style.color = isError ? 'red' : 'green';
        notification.style.display = 'block';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }
}

// Add placeholder functions for approve/decline to avoid errors
window.approveRequest = function(requestId) {
    console.log(`Approving request ${requestId}...`);
    // TODO: Implement API call to an approval endpoint
    alert(`Approval for ${requestId} is not yet implemented.`);
};

window.declineRequest = function(requestId) {
    console.log(`Declining request ${requestId}...`);
    // TODO: Implement API call to a decline endpoint
    alert(`Decline for ${requestId} is not yet implemented.`);
};
