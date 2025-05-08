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
