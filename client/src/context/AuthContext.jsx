import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('datasight_token'));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('datasight_user');
        if (storedUser && token) {
            try { setUser(JSON.parse(storedUser)); } catch { logout(); }
        }
    }, []);

    const login = async (username, password) => {
        setLoading(true);
        try {
            const form = new URLSearchParams();
            form.append('username', username);
            form.append('password', password);
            const res = await axios.post('http://localhost:8000/login', form, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const { access_token, username: uname } = res.data;
            localStorage.setItem('datasight_token', access_token);
            localStorage.setItem('datasight_user', JSON.stringify({ username: uname }));
            setToken(access_token);
            setUser({ username: uname });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.response?.data?.detail || 'Login failed.' };
        } finally {
            setLoading(false);
        }
    };

    const signup = async (username, password) => {
        setLoading(true);
        try {
            const res = await axios.post('http://localhost:8000/signup', { username, password });
            const { access_token, username: uname } = res.data;
            localStorage.setItem('datasight_token', access_token);
            localStorage.setItem('datasight_user', JSON.stringify({ username: uname }));
            setToken(access_token);
            setUser({ username: uname });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.response?.data?.detail || 'Signup failed.' };
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        localStorage.removeItem('datasight_token');
        localStorage.removeItem('datasight_user');
        setToken(null);
        setUser(null);
    };

    // Attach token to all axios requests
    useEffect(() => {
        const interceptor = axios.interceptors.request.use(config => {
            const t = localStorage.getItem('datasight_token');
            if (t) config.headers.Authorization = `Bearer ${t}`;
            return config;
        });
        return () => axios.interceptors.request.eject(interceptor);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, login, signup, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
