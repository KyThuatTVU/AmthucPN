const API_BASE_URL = 'http://localhost:3001/api';

// Auth state management
const auth = {
    isAuthenticated: false,
    user: null,

    // Initialize auth state from localStorage
    init() {
        const user = localStorage.getItem('user');
        if (user) {
            this.isAuthenticated = true;
            this.user = JSON.parse(user);
        }
    },

    // Login
    async login(email, password) {
        try {
            console.log('Attempting login for:', email);
            
            const response = await fetch(`${API_BASE_URL}/khachhang/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            
            if (!response.ok) {
                console.error('Login failed:', data);
                throw new Error(data.error || 'Đăng nhập thất bại');
            }

            // Store user data
            localStorage.setItem('user', JSON.stringify(data.khach_hang));
            this.isAuthenticated = true;
            this.user = data.khach_hang;

            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw new Error(error.message || 'Lỗi kết nối máy chủ');
        }
    },

    // Logout
    logout() {
        localStorage.removeItem('user');
        this.isAuthenticated = false;
        this.user = null;
    },

    async register(userData) {
        try {
            const response = await fetch(`${API_BASE_URL}/khachhang/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Đăng ký thất bại');
            }

            return data;
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }
};

// Initialize auth state
auth.init();

// Export auth object
window.auth = auth;

function getCurrentUser() {
    const user = JSON.parse(localStorage.getItem('user'));
    return user;
}

function checkAuth() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

function getUserId() {
    const user = JSON.parse(localStorage.getItem('user'));
    return user ? user.id : null;
}